import { authenticate } from "../shopify.server";
import { getProductConfig, upsertProductConfig } from "../models/productVtoConfig.server";



/**
 * Admin UI Extension API endpoint for VTO product configuration.
 * 
 * GET: Fetch existing VTO config + product images for a product
 * POST: Save VTO config for a product
 * 
 * Auth: Uses Shopify session token from the admin extension
 */

function getCorsHeaders(request) {
    const origin = request.headers.get("Origin") || "*";
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
    };
}

function jsonResponse(data, status, corsHeaders) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
    });
}

export const loader = async ({ request }) => {
    const corsHeaders = getCorsHeaders(request);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    let admin;
    let session;
    try {
        const authResult = await authenticate.admin(request);
        admin = authResult.admin;
        session = authResult.session;
    } catch (error) {
        console.error("Authenticate.admin failed:", error);
        if (error instanceof Response && error.status === 302) {
            return jsonResponse({ error: "Unauthorized - Session invalid" }, 401, corsHeaders);
        }
        throw error;
    }

    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");

    if (!productId) {
        return jsonResponse({ error: "Missing productId" }, 400, corsHeaders);
    }

    // Normalize product ID
    let normalizedId = productId;
    if (!productId.startsWith("gid://")) {
        normalizedId = `gid://shopify/Product/${productId}`;
    }

    try {
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
            { variables: { id: normalizedId } }
        );

        const gqlData = await gqlResponse.json();
        const product = gqlData?.data?.product;

        if (!product) {
            return jsonResponse({ error: "Product not found" }, 404, corsHeaders);
        }

        // 1. Try to get config from our DB first (Source of Truth for Storefront)
        const dbConfig = await getProductConfig(session.shop, normalizedId);

        if (dbConfig) {
            return jsonResponse(
                {
                    enabled: dbConfig.isEnabled,
                    productId: normalizedId,
                    selectedImageId: dbConfig.selectedImageId,
                    selectedImageUrl: dbConfig.selectedImageUrl,
                    productTitle: dbConfig.productTitle,
                    images: product?.images?.nodes || []
                },
                200,
                corsHeaders
            );
        }

        // 2. Fallback to Metafields if no DB record exists
        const images = product.images?.nodes || [];
        const isEnabled = product.metafieldVtoEnabled?.value === "true";
        const selectedImageId = product.metafieldVtoImageId?.value || "";

        // Resolve selectedImageUrl from the image list
        const selectedImage = images.find(img => img.id === selectedImageId);
        const selectedImageUrl = selectedImage ? selectedImage.url : "";

        return jsonResponse(
            {
                enabled: isEnabled,
                productId: normalizedId,
                selectedImageId,
                selectedImageUrl,
                productTitle: product.title || "",
                images,
            },
            200,
            corsHeaders
        );

    } catch (error) {
        console.error("Error in VTO config loader:", error);
        return jsonResponse({ error: "Internal server error" }, 500, corsHeaders);
    }
};

export const action = async ({ request }) => {
    const corsHeaders = getCorsHeaders(request);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    let admin;
    let session;
    try {
        const authResult = await authenticate.admin(request);
        admin = authResult.admin;
        session = authResult.session;
    } catch (error) {
        console.error("Action Authenticate.admin failed:", error);
        if (error instanceof Response && error.status === 302) {
            return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
        }
        throw error;
    }

    try {
        const body = await request.json();
        const { productId, isEnabled, selectedImageId } = body;

        if (!productId) {
            return jsonResponse({ error: "Missing productId" }, 400, corsHeaders);
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

        const data = await response.json();
        const userErrors = data?.data?.metafieldsSet?.userErrors || [];

        if (userErrors.length > 0) {
            console.error("Metafields set errors:", userErrors);
            // We continue even if metafields fail, because DB value is more important for our app
        }

        // SYNC WITH LOCAL DB (Critical for Storefront Button)
        // We need image URL and product title, but we might not have them in the POST body.
        // For simplicity, we'll try to use what's sent, or just update the enabled/imageId status if existing.
        // Ideally the frontend sends everything.

        // If we don't have details, better to fetch them or assume partial update.
        // `upsertProductConfig` expects full details for create, but update only needs partial.
        // Let's rely on what the frontend sends. The `BlockExtension.jsx` sends:
        // productId, productTitle, isEnabled, selectedImageId, selectedImageUrl, productImage

        await upsertProductConfig({
            shop: session.shop, // Use the session shop
            productId: normalizedId,
            productTitle: body.productTitle || "",
            productImage: body.productImage || "",
            selectedImageId: selectedImageId || "",
            selectedImageUrl: body.selectedImageUrl || "",
            isEnabled: Boolean(isEnabled)
        });

        return jsonResponse(
            { success: true, message: "VTO configuration saved" },
            200,
            corsHeaders
        );

    } catch (error) {
        console.error("Error saving VTO config:", error);
        return jsonResponse(
            { error: "Failed to save configuration" },
            500,
            corsHeaders
        );
    }
};
