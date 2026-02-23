import { unauthenticated } from "../shopify.server";
import { getProductConfig, upsertProductConfig } from "../models/productVtoConfig.server";
import { jwtVerify } from "jose";

/**
 * Admin UI Extension API endpoint for VTO product configuration.
 * 
 * Route: /api/vto-product-config (standalone, outside app.jsx layout)
 * 
 * Auth: Manually validates Shopify ID token (JWT) from Authorization: Bearer header.
 * We cannot use authenticate.admin() here because:
 *   1. unstable_newEmbeddedAuthStrategy returns 204 for cross-origin requests
 *   2. React Router's CSRF protection blocks cross-origin POSTs
 * 
 * The ID token from auth.idToken() in admin extensions is a Shopify-signed JWT.
 * We verify it using Shopify's JWKS endpoint.
 */

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
};

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
}

async function verifyIdToken(request) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        throw new Error("Missing Bearer token");
    }
    const token = authHeader.slice(7);

    // Shopify Admin ID tokens (session tokens) are symmetrically signed with the app's secret using HS256
    const secret = new TextEncoder().encode(process.env.SHOPIFY_API_SECRET);

    const { payload } = await jwtVerify(token, secret, {
        algorithms: ["HS256"], // Critical for security: force HS256
    });

    // Extract shop from the 'dest' claim (e.g. "https://my-store.myshopify.com")
    const dest = payload.dest;
    if (!dest) throw new Error("No dest claim in token");
    const shop = new URL(dest).hostname;

    return { shop, payload };
}

async function parseGraphql(response) {
    const json = await response.json();
    if (json?.errors?.length) {
        const message = json.errors.map((e) => e.message).join("; ");
        throw new Error(`Shopify GraphQL errors: ${message}`);
    }
    return json;
}

async function getAdminClient(shop) {
    const { admin } = await unauthenticated.admin(shop);
    return admin;
}

async function fetchProductWithImages(admin, productId) {
    const gqlResponse = await admin.graphql(
        `#graphql
        query getProductData($id: ID!) {
            product(id: $id) {
                title
                images(first: 50) {
                    nodes { id url altText }
                }
                metafieldVtoEnabled: metafield(namespace: "vton", key: "enabled") { value }
                metafieldVtoImageId: metafield(namespace: "vton", key: "image_id") { value }
            }
        }`,
        { variables: { id: productId } }
    );
    const data = await parseGraphql(gqlResponse);
    return data?.data?.product || null;
}

async function fetchProductForSave(admin, productId) {
    const gqlResponse = await admin.graphql(
        `#graphql
        query getProductForSave($id: ID!) {
            product(id: $id) {
                title
                images(first: 1) { nodes { url } }
            }
        }`,
        { variables: { id: productId } }
    );
    const data = await parseGraphql(gqlResponse);
    return data?.data?.product || null;
}

async function fetchImageById(admin, imageId) {
    if (!imageId) return null;
    const gqlResponse = await admin.graphql(
        `#graphql
        query getImageById($id: ID!) {
            node(id: $id) {
                __typename
                ... on MediaImage { image { url altText } }
                ... on Image { id url altText }
            }
        }`,
        { variables: { id: imageId } }
    );
    const data = await parseGraphql(gqlResponse);
    const node = data?.data?.node;
    if (!node) return null;
    if (node.__typename === "MediaImage") return node.image || null;
    if (node.__typename === "Image") return { url: node.url, altText: node.altText };
    return null;
}

// GET: Fetch product VTO config
export const loader = async ({ request }) => {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    let shop;
    try {
        ({ shop } = await verifyIdToken(request));
    } catch (error) {
        console.error("VTO GET auth failed:", error.message);
        return jsonResponse({ error: "Authentication failed", details: error.message }, 401);
    }

    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");

    if (!productId) {
        return jsonResponse({ error: "Missing productId" }, 400);
    }

    let normalizedId = productId;
    if (!productId.startsWith("gid://")) {
        normalizedId = `gid://shopify/Product/${productId}`;
    }

    try {
        const admin = await getAdminClient(shop);
        const product = await fetchProductWithImages(admin, normalizedId);

        if (!product) {
            return jsonResponse({ error: "Product not found" }, 404);
        }

        const dbConfig = await getProductConfig(shop, normalizedId);

        if (dbConfig) {
            return jsonResponse({
                enabled: dbConfig.isEnabled,
                productId: normalizedId,
                selectedImageId: dbConfig.selectedImageId,
                selectedImageUrl: dbConfig.selectedImageUrl,
                productTitle: dbConfig.productTitle,
                images: product?.images?.nodes || []
            }, 200);
        }

        const images = product.images?.nodes || [];
        const isEnabled = product.metafieldVtoEnabled?.value === "true";
        const selectedImageId = product.metafieldVtoImageId?.value || "";

        let selectedImage = images.find(img => img.id === selectedImageId);
        if (!selectedImage && selectedImageId) {
            const resolved = await fetchImageById(admin, selectedImageId);
            if (resolved?.url) {
                selectedImage = { id: selectedImageId, url: resolved.url, altText: resolved.altText || "" };
                images.unshift(selectedImage);
            }
        }

        return jsonResponse({
            enabled: isEnabled,
            productId: normalizedId,
            selectedImageId,
            selectedImageUrl: selectedImage?.url || "",
            productTitle: product.title || "",
            images,
        }, 200);

    } catch (error) {
        console.error("VTO GET error:", error);
        return jsonResponse({ error: "Internal server error", details: error.message }, 500);
    }
};

// POST: Save product VTO config + OPTIONS preflight
export const action = async ({ request }) => {
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    let shop;
    try {
        ({ shop } = await verifyIdToken(request));
    } catch (error) {
        console.error("VTO POST auth failed:", error.message);
        return jsonResponse({ error: "Authentication failed", details: error.message }, 401);
    }

    try {
        const body = await request.json();
        const { productId, isEnabled, selectedImageId, selectedImageUrl } = body;

        if (!productId) {
            return jsonResponse({ error: "Missing productId" }, 400);
        }

        let normalizedId = productId;
        if (!productId.startsWith("gid://")) {
            normalizedId = `gid://shopify/Product/${productId}`;
        }

        const admin = await getAdminClient(shop);

        const metafields = [
            { ownerId: normalizedId, namespace: "vton", key: "enabled", type: "boolean", value: String(Boolean(isEnabled)) }
        ];
        if (selectedImageId) {
            metafields.push({ ownerId: normalizedId, namespace: "vton", key: "image_id", type: "single_line_text_field", value: selectedImageId });
        }

        const gqlResponse = await admin.graphql(
            `#graphql
            mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    userErrors { field message }
                }
            }`,
            { variables: { metafields } }
        );

        const data = await parseGraphql(gqlResponse);
        const userErrors = data?.data?.metafieldsSet?.userErrors || [];
        if (userErrors.length > 0) {
            return jsonResponse({ error: "Metafields update failed", userErrors }, 422);
        }

        const product = await fetchProductForSave(admin, normalizedId);
        if (!product) return jsonResponse({ error: "Product not found" }, 404);

        await upsertProductConfig({
            shop,
            productId: normalizedId,
            productTitle: product.title || "",
            productImage: product.images?.nodes?.[0]?.url || "",
            selectedImageId: selectedImageId || "",
            selectedImageUrl: selectedImageUrl || "",
            isEnabled: Boolean(isEnabled),
        });

        return jsonResponse({ success: true, message: "VTO configuration saved" }, 200);

    } catch (error) {
        console.error("VTO POST error:", error);
        return jsonResponse({ error: "Failed to save configuration", details: error.message }, 500);
    }
};
