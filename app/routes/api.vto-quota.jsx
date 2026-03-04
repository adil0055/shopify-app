import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const { session } = await authenticate.public.appProxy(request);
        if (!session) {
            return new Response(
                JSON.stringify({ ok: false, error: "Unauthorized" }),
                { status: 401, headers: corsHeaders }
            );
        }

        const shop = session.shop;

        const VTO_API_BASE = process.env.VTO_API_BASE_URL;

        // Call the external Python backend to check quota
        if (VTO_API_BASE) {
            try {
                const backendResponse = await fetch(`${VTO_API_BASE}/api/v1/external/merchants/${shop}/quota`, {
                    method: "GET",
                });

                if (backendResponse.ok) {
                    const data = await backendResponse.json();
                    return new Response(
                        JSON.stringify({ ok: true, hasQuota: data.has_quota }),
                        { status: 200, headers: corsHeaders }
                    );
                }
            } catch (err) {
                console.error("Failed to reach Python backend for quota check:", err);
            }
        }

        // If backend fails or is not configured, we'll default to true so the app still works in dev
        // In production you may want to default this to false.
        return new Response(
            JSON.stringify({ ok: true, hasQuota: true }),
            { status: 200, headers: corsHeaders }
        );

    } catch (e) {
        console.error("Quota check failed:", e);
        return new Response(
            JSON.stringify({ ok: false, error: "Server error", hasQuota: false }),
            { status: 500, headers: corsHeaders }
        );
    }
};
