import { getProductConfig, getEnabledProducts } from "../models/productVtoConfig.server";
import { getOrCreateShopSettings } from "../models/shopSettings.server";
import { checkRateLimit } from "../utils/rateLimit.server";

/**
 * Public API endpoint for checking VTO configuration.
 * Called by the Theme App Extension to determine:
 * 1. Whether to show the Try-On button for a product
 * 2. Which image to use for VTO
 * 
 * This endpoint does NOT require OAuth - it uses the App Proxy pattern
 * or can be called directly with shop parameter.
 */

export const loader = async ({ request }) => {
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");
    const productId = url.searchParams.get("productId");

    // CORS headers for cross-origin requests from storefront
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    };

    // Handle preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (!shop) {
        return new Response(
            JSON.stringify({ error: "Missing shop parameter" }),
            { status: 400, headers: corsHeaders }
        );
    }

    // Rate limiting — 60 requests/minute per shop
    const rateCheck = checkRateLimit(shop);
    if (!rateCheck.allowed) {
        return new Response(
            JSON.stringify({
                error: "Rate limit exceeded. Try again shortly.",
                retryAfter: rateCheck.retryAfter,
            }),
            {
                status: 429,
                headers: {
                    ...corsHeaders,
                    "Retry-After": String(rateCheck.retryAfter),
                    "X-RateLimit-Remaining": "0",
                },
            }
        );
    }

    // Add rate limit headers
    const rateLimitHeaders = {
        ...corsHeaders,
        "X-RateLimit-Remaining": String(rateCheck.remaining),
    };

    try {
        // Fetch button customization settings for this shop
        const shopSettings = await getOrCreateShopSettings(shop);
        const buttonStyle = {
            btnLabel: shopSettings.btnLabel || "Try On",
            btnColor: shopSettings.btnColor || "#000000",
            btnTextColor: shopSettings.btnTextColor || "#ffffff",
            btnBorderRadius: shopSettings.btnBorderRadius ?? 4,
            allowGuestAccess: shopSettings.allowGuestAccess ?? false,
            appLanguage: shopSettings.appLanguage || "shopify_default",
        };

        // If productId is provided, get specific product config
        if (productId) {
            // Normalize the product ID (handle both GID and numeric formats)
            let normalizedId = productId;
            if (!productId.startsWith("gid://")) {
                normalizedId = `gid://shopify/Product/${productId}`;
            }

            const config = await getProductConfig(shop, normalizedId);

            if (!config || !config.isEnabled) {
                return new Response(
                    JSON.stringify({
                        enabled: false,
                        productId: normalizedId,
                        ...buttonStyle,
                    }),
                    { status: 200, headers: rateLimitHeaders }
                );
            }

            return new Response(
                JSON.stringify({
                    enabled: true,
                    productId: config.productId,
                    selectedImageId: config.selectedImageId,
                    selectedImageUrl: config.selectedImageUrl,
                    productTitle: config.productTitle,
                    ...buttonStyle,
                }),
                { status: 200, headers: rateLimitHeaders }
            );
        }

        // If no productId, return all enabled products for this shop
        const enabledProducts = await getEnabledProducts(shop);

        return new Response(
            JSON.stringify({
                shop,
                products: enabledProducts.map(p => ({
                    productId: p.productId,
                    productTitle: p.productTitle,
                    selectedImageId: p.selectedImageId,
                    selectedImageUrl: p.selectedImageUrl,
                })),
                count: enabledProducts.length,
            }),
            { status: 200, headers: rateLimitHeaders }
        );

    } catch (error) {
        console.error("VTO config API error:", error);
        return new Response(
            JSON.stringify({ error: "Internal server error" }),
            { status: 500, headers: rateLimitHeaders }
        );
    }
};

// Handle OPTIONS for CORS preflight
export const action = async ({ request }) => {
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }

    return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
    );
};
