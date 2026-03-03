import { unauthenticated } from "../shopify.server";

const SETTINGS_NAMESPACE = "vto_settings";

async function getAdmin(shop) {
  const { admin } = await unauthenticated.admin(shop);
  return admin;
}

const DEFAULT_SETTINGS = {
  vtoBaseUrl: "",
  isEnabled: true,
  planTier: "FREE",
  btnLabel: "Try On",
  btnColor: "#000000",
  btnTextColor: "#ffffff",
  btnBorderRadius: 4,
  emailCollectionStep: 2,
  maxGenerationsPerWeek: 6,
  dataRetentionDays: 7,
  appLanguage: "shopify_default",
  allowGuestAccess: false,
};

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

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.hash = "";

  return url.toString();
}

/**
 * Fetch settings from Shop metafields. Falls back to DEFAULT_SETTINGS.
 */
export async function getOrCreateShopSettings(shop) {
  const admin = await getAdmin(shop);
  const response = await admin.graphql(
    `#graphql
        query {
            shop {
                id
                metafield(namespace: "vto_settings", key: "config") {
                    value
                }
            }
        }`
  );

  const json = await response.json();
  const metafield = json.data?.shop?.metafield;

  if (metafield?.value) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(metafield.value) };
    } catch (e) {
      console.error("Failed to parse shop settings metafield:", e);
    }
  }

  // Auto-create defaults if none exist
  await saveSettings(shop, DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

/**
 * Helper to save JSON blob to Shop Metafield
 */
async function saveSettings(shop, settingsObj) {
  const admin = await getAdmin(shop);

  // We need the shop ID to set metafields on the Store itself
  const shopResponse = await admin.graphql(
    `query { shop { id } }`
  );
  const shopId = (await shopResponse.json()).data.shop.id;

  const response = await admin.graphql(
    `#graphql
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                userErrors { field message }
            }
        }`,
    {
      variables: {
        metafields: [
          {
            ownerId: shopId,
            namespace: SETTINGS_NAMESPACE,
            key: "config",
            type: "json",
            value: JSON.stringify(settingsObj),
          },
        ],
      },
    }
  );

  const result = await response.json();
  if (result.data?.metafieldsSet?.userErrors?.length > 0) {
    console.error("ShopSettings metafieldsSet errors:", result.data.metafieldsSet.userErrors);
  }

  return settingsObj;
}

export async function updateShopSettings(shop, updates) {
  const current = await getOrCreateShopSettings(shop);
  const newSettings = { ...current, ...updates };
  return saveSettings(shop, newSettings);
}

export async function updatePlanTier(shop, planTier) {
  const current = await getOrCreateShopSettings(shop);
  const newSettings = { ...current, planTier };
  return saveSettings(shop, newSettings);
}

export async function updateButtonCustomization(shop, updates) {
  const current = await getOrCreateShopSettings(shop);
  const newSettings = { ...current, ...updates };
  return saveSettings(shop, newSettings);
}
