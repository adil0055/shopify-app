import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
    const { payload, shop, topic } = await authenticate.webhook(request);

    console.log(`Received ${topic} webhook for ${shop}`);

    const VTO_API_BASE = process.env.VTO_API_BASE_URL;

    if (VTO_API_BASE) {
        try {
            const response = await fetch(`${VTO_API_BASE}/gdpr/customers/request`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error("Failed to forward customers/data_request to Python backend:", response.status);
            }
        } catch (err) {
            console.error("Error forwarding customers/data_request webhook:", err);
        }
    }

    return new Response();
};
