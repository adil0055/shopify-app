import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { payload, shop, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    const VTO_API_BASE = process.env.VTO_API_BASE_URL;

    if (VTO_API_BASE) {
        try {
            const response = await fetch(`${VTO_API_BASE}/gdpr/shop/redact`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error("Failed to forward shop/redact to Python backend:", response.status);
            }
        } catch (err) {
            console.error("Error forwarding shop/redact webhook:", err);
        }
    }

    return new Response();
};
