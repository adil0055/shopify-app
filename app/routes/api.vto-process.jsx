import prisma from "../db.server";
import { getOrCreateShopSettings } from "../models/shopSettings.server";
import { getPlanLimit } from "../config/planLimits";
import { randomUUID } from "crypto";

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

    try {
        const formData = await request.formData();
        const personImage = formData.get("person_image");       // File blob
        const garmentImageUrl = formData.get("garment_image");  // URL string
        const shop = formData.get("shop");                      // myshopify domain
        const productId = formData.get("product_id");           // Shopify GID
        const category = formData.get("category") || "tops";    // garment category
        const customerSessionId = formData.get("session_id") || "anon";

        // ── Validate ──
        if (!personImage || !garmentImageUrl || !shop) {
            return new Response(
                JSON.stringify({ ok: false, error: "Missing required fields: person_image, garment_image, shop" }),
                { status: 400, headers: corsHeaders }
            );
        }

        // ── Quota Check ──
        const settings = await getOrCreateShopSettings(shop);
        const planTier = settings.planTier || "FREE";
        const limits = getPlanLimit(planTier);

        if (limits.vtoGenerationsPerMonth !== -1) {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const usageCount = await prisma.apiCallLog.count({
                where: {
                    shop,
                    eventType: "VTO_JOB_REQUEST",
                    createdAt: { gte: startOfMonth },
                },
            });

            if (usageCount >= limits.vtoGenerationsPerMonth) {
                return new Response(
                    JSON.stringify({
                        ok: false,
                        error: "Monthly VTO quota exceeded",
                        used: usageCount,
                        limit: limits.vtoGenerationsPerMonth,
                        planTier,
                    }),
                    { status: 429, headers: corsHeaders }
                );
            }
        }

        // ── Build request to external VTO backend ──
        const VTO_API_BASE = process.env.VTO_API_BASE_URL;
        const VTO_CLIENT_ID = process.env.VTO_CLIENT_ID;
        const VTO_CLIENT_SECRET = process.env.VTO_CLIENT_SECRET;

        if (!VTO_API_BASE || !VTO_CLIENT_ID || !VTO_CLIENT_SECRET) {
            console.error("VTO backend env vars not configured");
            return new Response(
                JSON.stringify({ ok: false, error: "VTO backend not configured. Contact the app administrator." }),
                { status: 503, headers: corsHeaders }
            );
        }

        const userId = `${shop}_${customerSessionId}`;
        const userImageId = `v_${Date.now()}`;
        const idempotencyKey = randomUUID();

        const backendForm = new FormData();
        backendForm.append("user_id", userId);
        backendForm.append("user_image_id", userImageId);
        backendForm.append("garment_id", productId || "unknown");
        backendForm.append("category", category);
        backendForm.append("garment_image_url", garmentImageUrl);
        backendForm.append("consent_confirmed", "true");

        // Attach the person image file
        if (personImage instanceof File || personImage instanceof Blob) {
            backendForm.append("user_image", personImage, personImage.name || "photo.jpg");
        } else {
            return new Response(
                JSON.stringify({ ok: false, error: "person_image must be a file" }),
                { status: 400, headers: corsHeaders }
            );
        }

        // ── Call external VTO backend ──
        const backendResponse = await fetch(`${VTO_API_BASE}/vton/process`, {
            method: "POST",
            headers: {
                "X-Client-ID": VTO_CLIENT_ID,
                "X-Client-Secret": VTO_CLIENT_SECRET,
                "Idempotency-Key": idempotencyKey,
            },
            body: backendForm,
        });

        const backendData = await backendResponse.json();

        // ── Log the request ──
        await prisma.apiCallLog.create({
            data: {
                shop,
                eventType: "VTO_JOB_REQUEST",
                isSuccess: backendResponse.ok,
                requestId: idempotencyKey,
                message: backendResponse.ok ? "Job submitted" : `Backend error: ${backendData.error || backendResponse.status}`,
                metadata: {
                    jobId: backendData.job_id || null,
                    productId,
                    category,
                    planTier,
                },
            },
        });

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
