// This maintains an in-memory cache of job processing statuses.
// A job enters the cache when submitted, and the Python backend updates it via Webhooks.

if (!global.__jobCache) {
    global.__jobCache = new Map();
}

export const jobCache = global.__jobCache;
