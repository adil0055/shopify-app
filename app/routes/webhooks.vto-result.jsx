import { jobCache } from "../utils/jobCache.server";

export const action = async ({ request }) => {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    try {
        const body = await request.json();
        const { job_id, status, output_image_url, error } = body;

        if (!job_id) {
            return new Response("Missing job_id", { status: 400 });
        }

        console.log(`[Webhook] Received update for job ${job_id}: ${status}`);

        // Update the temporary in-memory cache shared with the polling proxy
        jobCache.set(job_id, {
            status: status || "FAILED",
            resultUrl: output_image_url || null,
            error: error || null,
            updatedAt: Date.now()
        });

        // Optional: clear memory after an hour to prevent leaks
        setTimeout(() => {
            jobCache.delete(job_id);
        }, 1000 * 60 * 60);

        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } catch (err) {
        console.error("VTO Result webhook error:", err);
        return new Response("Server error", { status: 500 });
    }
};
