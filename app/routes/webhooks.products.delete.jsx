import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
    const { shop, payload, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    if (!payload?.admin_graphql_api_id) {
        return new Response();
    }

    const productGid = payload.admin_graphql_api_id; // e.g. "gid://shopify/Product/123"

    try {
        // Remove the product VTO config for the deleted product
        const deleted = await db.productVtoConfig.deleteMany({
            where: {
                shop,
                productId: productGid,
            },
        });

        if (deleted.count > 0) {
            console.log(
                `Removed VTO config for deleted product ${productGid} in ${shop}`
            );
        }
    } catch (error) {
        console.error(
            `Error processing products/delete webhook for ${shop}:`,
            error
        );
    }

    return new Response();
};
