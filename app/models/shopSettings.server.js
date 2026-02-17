import prisma from "../db.server";

const DEFAULT_VTO_BASE_URL = "";

export function normalizeVtoBaseUrl(input) {
  const value = String(input ?? "").trim();
  if (!value) return "";

  let url;
  try {
    url = new URL(value);
  } catch {
    return "";
  }

  if (url.protocol !== "https:") return "";

  // Normalize: remove trailing slash to make concatenation predictable.
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.hash = "";

  return url.toString();
}

export async function getOrCreateShopSettings(shop) {
  const existing = await prisma.shopSettings.findUnique({ where: { shop } });
  if (existing) return existing;

  return prisma.shopSettings.create({
    data: {
      shop,
      vtoBaseUrl: DEFAULT_VTO_BASE_URL,
      isEnabled: true,
    },
  });
}

export async function updateShopSettings(shop, { vtoBaseUrl, isEnabled, emailCollectionStep, maxGenerationsPerWeek, dataRetentionDays, appLanguage }) {
  return prisma.shopSettings.upsert({
    where: { shop },
    create: {
      shop,
      vtoBaseUrl: vtoBaseUrl ?? "",
      isEnabled,
      emailCollectionStep,
      maxGenerationsPerWeek,
      dataRetentionDays,
      appLanguage,
    },
    update: {
      vtoBaseUrl,
      isEnabled,
      emailCollectionStep,
      maxGenerationsPerWeek,
      dataRetentionDays,
      appLanguage,
    },
  });
}

export async function updatePlanTier(shop, planTier) {
  return prisma.shopSettings.upsert({
    where: { shop },
    create: {
      shop,
      vtoBaseUrl: DEFAULT_VTO_BASE_URL,
      isEnabled: true,
      planTier,
    },
    update: {
      planTier,
    },
  });
}


