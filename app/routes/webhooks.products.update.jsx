import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
    const { shop, session, payload, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    // Webhook requests can trigger after an app is uninstalled.
    // If the app is already uninstalled, the session may be undefined.
    if (!session) {
        throw new Response();
    }

    if (!payload?.admin_graphql_api_id) {
        return new Response();
    }

    const productGid = payload.admin_graphql_api_id; // e.g. "gid://shopify/Product/123"

    try {
        // Check if we have a config for this product
        const existing = await db.productVtoConfig.findUnique({
            where: {
                shop_productId: { shop, productId: productGid },
            },
        });

        if (!existing) {
            // We don't track this product — nothing to update
            return new Response();
        }

        // Update cached product info
        const updateData = {};

        if (payload.title && payload.title !== existing.productTitle) {
            updateData.productTitle = payload.title;
        }

        // Update product thumbnail from featured image
        const newImage =
            payload.image?.src ||
            payload.images?.[0]?.src ||
            null;

        if (newImage && newImage !== existing.productImage) {
            updateData.productImage = newImage;
        }

        if (Object.keys(updateData).length > 0) {
            await db.productVtoConfig.update({
                where: {
                    shop_productId: { shop, productId: productGid },
                },
                data: updateData,
            });
            console.log(`Updated VTO config for product ${productGid} in ${shop}`);
        }
    } catch (error) {
        console.error(`Error processing products/update webhook for ${shop}:`, error);
    }

    return new Response();
};
