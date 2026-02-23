import { useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getProductConfig, upsertProductConfig } from "../models/productVtoConfig.server";

/**
 * Admin UI Extension API endpoint for VTO product configuration.
 *
 * GET: Fetch existing VTO config + product images for a product
 * POST: Save VTO config for a product
 *
 * Auth: Uses authenticate.admin() with cors() for cross-origin admin extension requests.
 * Docs: https://shopify.dev/docs/api/shopify-app-remix#authenticating-cross-origin-admin-requests
 */

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

async function parseGraphql(response) {
    const json = await response.json();
    if (json?.errors?.length) {
        const message = json.errors.map((e) => e.message).join("; ");
        throw new Error(`Shopify GraphQL errors: ${message}`);
    }
    return json;
}

async function fetchProductWithImages(admin, productId) {
    const gqlResponse = await admin.graphql(
        `#graphql
        query getProductData($id: ID!) {
            product(id: $id) {
                title
                images(first: 50) {
                    nodes {
                        id
                        url
                        altText
                    }
                }
                metafieldVtoEnabled: metafield(namespace: "vton", key: "enabled") {
                    value
                }
                metafieldVtoImageId: metafield(namespace: "vton", key: "image_id") {
                    value
                }
            }
        }`,
        { variables: { id: productId } }
    );
    const gqlData = await parseGraphql(gqlResponse);
    return gqlData?.data?.product || null;
}

async function fetchProductForSave(admin, productId) {
    const gqlResponse = await admin.graphql(
        `#graphql
        query getProductForSave($id: ID!) {
            product(id: $id) {
                title
                images(first: 1) {
                    nodes {
                        url
                    }
                }
            }
        }`,
        { variables: { id: productId } }
    );
    const gqlData = await parseGraphql(gqlResponse);
    return gqlData?.data?.product || null;
}

async function fetchImageById(admin, imageId) {
    if (!imageId) return null;
    const gqlResponse = await admin.graphql(
        `#graphql
        query getImageById($id: ID!) {
            node(id: $id) {
                __typename
                ... on MediaImage {
                    image {
                        url
                        altText
                    }
                }
                ... on ProductImage {
                    id
                    url
                    altText
                }
            }
        }`,
        { variables: { id: imageId } }
    );
    const gqlData = await parseGraphql(gqlResponse);
    const node = gqlData?.data?.node;
    if (!node) return null;
    if (node.__typename === "MediaImage") {
        return node.image ? { url: node.image.url, altText: node.image.altText } : null;
    }
    if (node.__typename === "ProductImage") {
        return { url: node.url, altText: node.altText };
    }
    return null;
}

export const loader = async ({ request }) => {
    let admin, session, cors;
    try {
        // cors() is required for cross-origin requests from admin extensions
        const authResult = await authenticate.admin(request);
        admin = authResult.admin;
        session = authResult.session;
        cors = authResult.cors;
    } catch (error) {
        if (error instanceof Response) {
            console.error("GET Auth: boundary redirect", error.status);
            return jsonResponse({ error: "Authentication required" }, 401);
        }
        console.error("Authenticate.admin failed:", error);
        return jsonResponse({ error: "Authentication failed" }, 401);
    }

    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");

    if (!productId) {
        return jsonResponse({ error: "Missing productId" }, 400);
    }

    // Normalize product ID
    let normalizedId = productId;
    if (!productId.startsWith("gid://")) {
        normalizedId = `gid://shopify/Product/${productId}`;
    }

    try {
        const product = await fetchProductWithImages(admin, normalizedId);

        if (!product) {
            return jsonResponse({ error: "Product not found" }, 404);
        }

        // 1. Try to get config from our DB first (Source of Truth for Storefront)
        const dbConfig = await getProductConfig(session.shop, normalizedId);

        if (dbConfig) {
            return cors(jsonResponse(
                {
                    enabled: dbConfig.isEnabled,
                    productId: normalizedId,
                    selectedImageId: dbConfig.selectedImageId,
                    selectedImageUrl: dbConfig.selectedImageUrl,
                    productTitle: dbConfig.productTitle,
                    images: product?.images?.nodes || []
                },
                200
            ));
        }

        // 2. Fallback to Metafields if no DB record exists
        const images = product.images?.nodes || [];
        const isEnabled = product.metafieldVtoEnabled?.value === "true";
        const selectedImageId = product.metafieldVtoImageId?.value || "";

        // Resolve selectedImageUrl from the image list
        let selectedImage = images.find(img => img.id === selectedImageId);
        if (!selectedImage && selectedImageId) {
            const resolved = await fetchImageById(admin, selectedImageId);
            if (resolved?.url) {
                selectedImage = {
                    id: selectedImageId,
                    url: resolved.url,
                    altText: resolved.altText || "",
                };
                images.unshift(selectedImage);
            }
        }
        const selectedImageUrl = selectedImage ? selectedImage.url : "";

        return cors(jsonResponse(
            {
                enabled: isEnabled,
                productId: normalizedId,
                selectedImageId,
                selectedImageUrl,
                productTitle: product.title || "",
                images,
            },
            200
        ));

    } catch (error) {
        console.error("Error in VTO config loader:", error);
        return jsonResponse(
            { error: "Internal server error", details: error?.message || String(error) },
            500
        );
    }
};

export const action = async ({ request }) => {
    let admin, session, cors;
    try {
        // cors() is required for cross-origin requests from admin extensions
        const authResult = await authenticate.admin(request);
        admin = authResult.admin;
        session = authResult.session;
        cors = authResult.cors;
    } catch (error) {
        if (error instanceof Response) {
            console.error("POST Auth: boundary redirect", error.status);
            return jsonResponse({ error: "Authentication required" }, 401);
        }
        console.error("Action Authenticate.admin failed:", error);
        return jsonResponse({ error: "Authentication failed" }, 401);
    }

    try {
        const body = await request.json();
        const { productId, isEnabled, selectedImageId } = body;

        if (!productId) {
            return jsonResponse({ error: "Missing productId" }, 400);
        }

        // Normalize product ID
        let normalizedId = productId;
        if (!productId.startsWith("gid://")) {
            normalizedId = `gid://shopify/Product/${productId}`;
        }

        // Prepare metafields array
        const metafields = [
            {
                ownerId: normalizedId,
                namespace: "vton",
                key: "enabled",
                type: "boolean",
                value: String(Boolean(isEnabled))
            }
        ];

        // Only save image_id if it exists to avoid "Value can't be blank" error
        if (selectedImageId) {
            metafields.push({
                ownerId: normalizedId,
                namespace: "vton",
                key: "image_id",
                type: "single_line_text_field",
                value: selectedImageId
            });
        }

        // Save to Metafields (Native Shopify Storage - kept for reference)
        const response = await admin.graphql(
            `#graphql
            mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    userErrors {
                        field
                        message
                    }
                }
            }`,
            {
                variables: { metafields }
            }
        );

        const data = await parseGraphql(response);
        const userErrors = data?.data?.metafieldsSet?.userErrors || [];

        if (userErrors.length > 0) {
            console.error("Metafields set errors:", userErrors);
            return jsonResponse(
                { error: "Metafields update failed", userErrors },
                422
            );
        }

        const product = await fetchProductForSave(admin, normalizedId);
        if (!product) {
            return jsonResponse({ error: "Product not found" }, 404);
        }

        const resolvedSelectedImage = await fetchImageById(admin, selectedImageId);

        await upsertProductConfig({
            shop: session.shop, // Use the session shop
            productId: normalizedId,
            productTitle: product.title || "",
            productImage: product.images?.nodes?.[0]?.url || "",
            selectedImageId: selectedImageId || "",
            selectedImageUrl: resolvedSelectedImage?.url || "",
            isEnabled: Boolean(isEnabled)
        });

        return cors(jsonResponse(
            { success: true, message: "VTO configuration saved" },
            200
        ));

    } catch (error) {
        console.error("Error saving VTO config:", error);
        return jsonResponse(
            { error: "Failed to save configuration", details: error?.message || String(error) },
            500
        );
    }
};

export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
