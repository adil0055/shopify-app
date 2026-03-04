import { randomUUID } from "crypto";
import { authenticate } from "../shopify.server";
import { jobCache } from "../utils/jobCache.server";

/**
 * VTO Process Proxy
 *
 * Receives the customer's photo from the /vto frontend,
 * checks merchant quota, then forwards to the external VTO backend.
 * Returns a job_id for polling.
 */

export const action = async ({ request }) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    };

    // CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // App Proxy Authentication
    let session;
    try {
        const authResult = await authenticate.public.appProxy(request);
        session = authResult.session;
    } catch (e) {
        return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized: Invalid signature" }),
            { status: 401, headers: corsHeaders }
        );
    }

    if (!session) {
        return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized: Missing session" }),
            { status: 401, headers: corsHeaders }
        );
    }
    const shop = session.shop;

    try {
        const formData = await request.formData();
        const personImage = formData.get("person_image");       // File blob (Optional)
        const garmentImageUrl = formData.get("garment_image");  // URL string
        const productId = formData.get("product_id");           // Shopify GID
        const category = formData.get("category") || "tops";    // garment category
        const userIdPayload = formData.get("user_id");

        // ── Validate ──
        if (!garmentImageUrl || !userIdPayload) {
            return new Response(
                JSON.stringify({ ok: false, error: "Missing required fields: user_id or garment_image" }),
                { status: 400, headers: corsHeaders }
            );
        }

        // Quota is managed entirely by the external Python Backend API via api.vto-quota proxy calls.

        // ── Build request to external VTO backend ──
        const VTO_API_BASE = process.env.VTO_API_BASE_URL;

        if (!VTO_API_BASE) {
            console.error("VTO backend env vars not configured");
            return new Response(
                JSON.stringify({ ok: false, error: "VTO backend not configured. Contact the app administrator." }),
                { status: 503, headers: corsHeaders }
            );
        }

        const userId = userIdPayload;
        const idempotencyKey = randomUUID();

        const backendForm = new FormData();
        backendForm.append("user_id", userId);
        backendForm.append("shop", shop);
        backendForm.append("garment_image_url", garmentImageUrl);

        const appUrl = process.env.SHOPIFY_APP_URL || `https://${request.headers.get("host")}`;
        backendForm.append("callback_url", `${appUrl}/webhooks/vto-result`);

        // Attach the person image file ONLY if they uploaded a new one
        if (personImage && (personImage instanceof File || personImage instanceof Blob)) {
            backendForm.append("user_image", personImage, personImage.name || "photo.jpg");
        } else if (personImage) {
            return new Response(
                JSON.stringify({ ok: false, error: "person_image must be a file" }),
                { status: 400, headers: corsHeaders }
            );
        }

        // ── Call external VTO backend ──
        const backendResponse = await fetch(`${VTO_API_BASE}/vton/process`, {
            method: "POST",
            headers: {
                "Idempotency-Key": idempotencyKey,
            },
            body: backendForm,
        });

        const backendData = await backendResponse.json();

        // The external API handles its own logging of requests and usage.

        if (!backendResponse.ok) {
            return new Response(
                JSON.stringify({
                    ok: false,
                    error: backendData.error || "VTO backend returned an error",
                    status: backendResponse.status,
                }),
                { status: backendResponse.status >= 500 ? 502 : backendResponse.status, headers: corsHeaders }
            );
        }

        // ── Ensure Shopify Customer Metafield is checked/updated ──
        if (personImage && userId.startsWith("shopify_cust_")) {
            try {
                const { unauthenticated } = require("../shopify.server");
                const { admin } = await unauthenticated.admin(shop);
                const actualCustomerId = userId.replace("shopify_cust_", "");

                await admin.graphql(`
                  mutation updateCustomerMetafields($input: CustomerInput!) {
                    customerUpdate(input: $input) {
                      userErrors {
                        field
                        message
                      }
                    }
                  }
                `, {
                    variables: {
                        input: {
                            id: `gid://shopify/Customer/${actualCustomerId}`,
                            metafields: [
                                {
                                    namespace: "vto",
                                    key: "has_image",
                                    type: "boolean",
                                    value: "true"
                                }
                            ]
                        }
                    }
                });
            } catch (err) {
                console.error("Failed to update Shopify Customer Metafield:", err);
            }
        }

        // Initialize our caching layer so the polling proxy sees this job immediately
        if (backendData.job_id) {
            jobCache.set(backendData.job_id, {
                status: backendData.status || "PROCESSING",
                resultUrl: backendData.output_image_url || null,
                error: null,
                updatedAt: Date.now(),
            });
        }

        // ── Return job info to frontend ──
        return new Response(
            JSON.stringify({
                ok: true,
                jobId: backendData.job_id,
                status: backendData.status || "PROCESSING",
                // If sync result is returned immediately
                resultUrl: backendData.output_image_url || null,
            }),
            { status: 200, headers: corsHeaders }
        );

    } catch (error) {
        console.error("VTO process proxy error:", error);
        return new Response(
            JSON.stringify({ ok: false, error: "Internal proxy error" }),
            { status: 500, headers: corsHeaders }
        );
    }
};
