import { authenticate } from "../shopify.server";
import db from "../db.server";
import { upsertProductConfig } from "../models/productVtoConfig.server";

/**
 * Webhook handler: products/update
 *
 * Handles two things:
 * 1. AUTO-ENABLE: When a product is imported/updated with the "vton-enabled" tag
 *    (e.g. via Shopify CSV import), automatically create a VTO config for it.
 *    The merchant still needs to select a VTO image from the Manage Products page.
 *
 * 2. SYNC: Keep cached productTitle and productImage in sync if a product
 *    that was already VTO-configured gets renamed or its images changed.
 */
export const action = async ({ request }) => {
    const { shop, session, payload, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    if (!session) {
        throw new Response();
    }

    if (!payload?.admin_graphql_api_id) {
        return new Response();
    }

    const productGid = payload.admin_graphql_api_id; // e.g. "gid://shopify/Product/123"

    try {
        // --- AUTO-ENABLE from "vton-enabled" tag ---
        // Tags come as a comma-separated string: "Casual, Vintage, vton-enabled"
        const rawTags = payload.tags || "";
        const tags = rawTags.split(",").map((t) => t.trim().toLowerCase());
        const hasVtonTag = tags.includes("vton-enabled");

        if (hasVtonTag) {
            // Use the first image as the product thumbnail (featured image)
            const productImage =
                payload.image?.src ||
                payload.images?.[0]?.src ||
                "";

            const existing = await db.productVtoConfig.findUnique({
                where: { shop_productId: { shop, productId: productGid } },
            });

            if (!existing) {
                // Brand new — auto-enable with no VTO image selected yet
                await upsertProductConfig({
                    shop,
                    productId: productGid,
                    productTitle: payload.title || "",
                    productImage,
                    selectedImageId: "",
                    selectedImageUrl: "",
                    isEnabled: true,
                });
                console.log(
                    `[VTO] Auto-enabled product ${productGid} for ${shop} via vton-enabled tag`
                );
            } else if (!existing.isEnabled) {
                // Was previously disabled — re-enable it
                await db.productVtoConfig.update({
                    where: { shop_productId: { shop, productId: productGid } },
                    data: {
                        isEnabled: true,
                        productTitle: payload.title || existing.productTitle,
                        productImage: productImage || existing.productImage,
                    },
                });
                console.log(
                    `[VTO] Re-enabled product ${productGid} for ${shop} via vton-enabled tag`
                );
            }
            // If already enabled, just fall through to the sync block below
        }

        // --- SYNC cached product data for already-tracked products ---
        const existing = await db.productVtoConfig.findUnique({
            where: { shop_productId: { shop, productId: productGid } },
        });

        if (!existing) {
            // Not tracked and doesn't have the tag — nothing to do
            return new Response();
        }

        const updateData = {};

        if (payload.title && payload.title !== existing.productTitle) {
            updateData.productTitle = payload.title;
        }

        const newImage =
            payload.image?.src ||
            payload.images?.[0]?.src ||
            null;

        if (newImage && newImage !== existing.productImage) {
            updateData.productImage = newImage;
        }

        if (Object.keys(updateData).length > 0) {
            await db.productVtoConfig.update({
                where: { shop_productId: { shop, productId: productGid } },
                data: updateData,
            });
            console.log(`[VTO] Synced product metadata for ${productGid} in ${shop}`);
        }
    } catch (error) {
        console.error(`[VTO] Error processing products/update webhook for ${shop}:`, error);
    }

    return new Response();
};
