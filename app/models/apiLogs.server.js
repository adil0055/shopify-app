import prisma from "../db.server";

function randomId() {
  return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
}

export async function listLogs(shop, { limit = 50, eventType } = {}) {
  return prisma.apiCallLog.findMany({
    where: {
      shop,
      ...(eventType ? { eventType } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function countLogs(shop) {
  return prisma.apiCallLog.count({ where: { shop } });
}

export async function createSampleLogs(shop) {
  const now = Date.now();
  const days = 14;
  const rows = [];
  const eventTypes = ["REDIRECT_OUT", "VTO_JOB_REQUEST", "VTO_JOB_SUCCESS", "VTO_JOB_FAILURE"];

  for (let d = 0; d < days; d++) {
    const dayStart = now - d * 24 * 60 * 60 * 1000;
    const n = 6 + Math.floor(Math.random() * 10);
    for (let i = 0; i < n; i++) {
      const createdAt = new Date(dayStart - Math.floor(Math.random() * 8 * 60 * 60 * 1000));
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      const isSuccess = eventType === "VTO_JOB_FAILURE" ? false : Math.random() > 0.08;

      rows.push({
        id: `log_${randomId()}`,
        shop,
        createdAt,
        eventType,
        isSuccess,
        requestId: `req_${randomId().slice(0, 12)}`,
        message: isSuccess ? "OK" : "Upstream processing error (sample)",
        metadata: {
          product_handle: "sample-product",
          variant_id: 1234567890,
          source: "sample",
        },
      });
    }
  }

  // Insert newest first is fine; UI will sort by createdAt desc.
  await prisma.apiCallLog.createMany({ data: rows });
}

export function summarizeLogsForWindow(logs) {
  const total = logs.length;
  const successes = logs.filter((l) => l.isSuccess).length;
  const failures = total - successes;

  return { total, successes, failures };
}

export function groupCountsByDay(logs, days) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const map = new Map();
  for (const l of logs) {
    const d = new Date(l.createdAt);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
  }

  return out;
}



