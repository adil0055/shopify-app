import prisma from "../db.server";
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

    const VTO_API_BASE = process.env.VTO_API_BASE_URL;
    const VTO_CLIENT_ID = process.env.VTO_CLIENT_ID;
    const VTO_CLIENT_SECRET = process.env.VTO_CLIENT_SECRET;

    if (!VTO_API_BASE || !VTO_CLIENT_ID || !VTO_CLIENT_SECRET) {
        return new Response(
            JSON.stringify({ ok: false, error: "VTO backend not configured" }),
            { status: 503, headers: corsHeaders }
        );
    }

    try {
        const backendResponse = await fetch(`${VTO_API_BASE}/jobs/${jobId}`, {
            method: "GET",
            headers: {
                "X-Client-ID": VTO_CLIENT_ID,
                "X-Client-Secret": VTO_CLIENT_SECRET,
            },
        });

        const data = await backendResponse.json();

        if (!backendResponse.ok) {
            return new Response(
                JSON.stringify({
                    ok: false,
                    error: data.error || "Failed to fetch job status",
                }),
                { status: backendResponse.status, headers: corsHeaders }
            );
        }

        // Normalize status to our format
        const status = (data.status || "").toUpperCase();
        const isComplete = status === "SUCCESS" || status === "COMPLETED";
        const isFailed = status === "FAILED" || status === "ERROR";

        // Log completion/failure (only once — check if already logged)
        if ((isComplete || isFailed) && shop) {
            const existingLog = await prisma.apiCallLog.findFirst({
                where: {
                    shop,
                    eventType: isComplete ? "VTO_JOB_SUCCESS" : "VTO_JOB_FAILURE",
                    requestId: jobId,
                },
            });

            if (!existingLog) {
                await prisma.apiCallLog.create({
                    data: {
                        shop,
                        eventType: isComplete ? "VTO_JOB_SUCCESS" : "VTO_JOB_FAILURE",
                        isSuccess: isComplete,
                        requestId: jobId,
                        message: isComplete
                            ? "Job completed successfully"
                            : `Job failed: ${data.error || "unknown"}`,
                        metadata: {
                            outputUrl: data.output_image_url || null,
                        },
                    },
                });
            }
        }

        return new Response(
            JSON.stringify({
                ok: true,
                jobId,
                status: isComplete ? "completed" : isFailed ? "failed" : "processing",
                progress: data.progress || null,
                resultUrl: data.output_image_url || null,
                error: isFailed ? (data.error || "Processing failed") : null,
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
