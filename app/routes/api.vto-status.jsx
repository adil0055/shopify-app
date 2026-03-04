import { authenticate } from "../shopify.server";
import { jobCache } from "../utils/jobCache.server";

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

    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");

    if (!jobId) {
        return new Response(
            JSON.stringify({ ok: false, error: "Missing jobId parameter" }),
            { status: 400, headers: corsHeaders }
        );
    }

    try {
        const cachedData = jobCache.get(jobId);

        if (!cachedData) {
            // It might not be in the cache yet, or it expired.
            // We return processing by default so the frontend doesn't panic.
            return new Response(
                JSON.stringify({
                    ok: true,
                    jobId,
                    status: "processing",
                    progress: 20,
                    resultUrl: null,
                    error: null,
                }),
                { status: 200, headers: corsHeaders }
            );
        }

        const status = (cachedData.status || "").toUpperCase();
        const isComplete = status === "SUCCESS" || status === "COMPLETED";
        const isFailed = status === "FAILED" || status === "ERROR";

        return new Response(
            JSON.stringify({
                ok: true,
                jobId,
                status: isComplete ? "completed" : isFailed ? "failed" : "processing",
                progress: cachedData.progress || null,
                resultUrl: cachedData.resultUrl || null,
                error: isFailed ? (cachedData.error || "Processing failed") : null,
            }),
            { status: 200, headers: corsHeaders }
        );

    } catch (error) {
        console.error("VTO status polling error:", error);
        return new Response(
            JSON.stringify({ ok: false, error: "Failed to check job status" }),
            { status: 500, headers: corsHeaders }
        );
    }
};
