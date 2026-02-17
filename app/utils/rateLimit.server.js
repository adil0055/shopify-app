/**
 * Simple in-memory rate limiter.
 * Not suitable for multi-process deployments; use Redis-backed limiter for production scale.
 */

const store = new Map();

const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS = 60;     // 60 requests per window per key

// Periodic cleanup to prevent memory leak
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (now - entry.windowStart > WINDOW_MS * 2) {
            store.delete(key);
        }
    }
}, 5 * 60 * 1000); // every 5 minutes

/**
 * Check rate limit for a given key (e.g. shop domain or IP).
 * @param {string} key
 * @returns {{ allowed: boolean, remaining: number, retryAfter?: number }}
 */
export function checkRateLimit(key) {
    const now = Date.now();
    const entry = store.get(key);

    // New window or expired window
    if (!entry || now - entry.windowStart > WINDOW_MS) {
        store.set(key, { windowStart: now, count: 1 });
        return { allowed: true, remaining: MAX_REQUESTS - 1 };
    }

    // Window still active — check count
    if (entry.count >= MAX_REQUESTS) {
        const retryAfter = Math.ceil(
            (entry.windowStart + WINDOW_MS - now) / 1000
        );
        return { allowed: false, remaining: 0, retryAfter };
    }

    entry.count++;
    return { allowed: true, remaining: MAX_REQUESTS - entry.count };
}
