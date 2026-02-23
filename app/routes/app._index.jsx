import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData, useRouteError, useNavigate, redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShopSettings } from "../models/shopSettings.server";
import {
  getOnboardingStatus,
  getEnabledProductCount,
  allProductsHaveImages,
  getEnabledProducts,
  bulkDisableProducts
} from "../models/productVtoConfig.server";
import { shopDomainToStoreHandle } from "../utils/shop.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settings, onboardingStatus, enabledCount, imagesComplete, enabledProductsList] =
    await Promise.all([
      getOrCreateShopSettings(shop),
      getOnboardingStatus(shop),
      getEnabledProductCount(shop),
      allProductsHaveImages(shop),
      getEnabledProducts(shop),
    ]);

  // Protect dashboard: require onboarding to be completed
  if (!onboardingStatus.isComplete) {
    throw redirect("/app/onboarding");
  }

  const storeHandle = shopDomainToStoreHandle(shop);

  return {
    shop,
    storeHandle,
    settings,
    enabledCount,
    enabledProductsList,
  };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "disable_product") {
    const productId = formData.get("productId");
    if (productId) {
      await bulkDisableProducts(session.shop, [productId]);
      return { success: true, message: "Product disabled." };
    }
  }

  return { success: false, error: "Unknown action" };
};

export default function Index() {
  const { shop, storeHandle, settings, enabledCount } = useLoaderData();
  const isEnabled = Boolean(settings?.isEnabled);
  const planTier = settings?.planTier || "FREE";
  const navigate = useNavigate();

  const themeEditorUrl = storeHandle
    ? `https://admin.shopify.com/store/${storeHandle}/themes/current/editor`
    : null;

  return (
    <s-page heading="Virtual Try-On Dashboard">
      {/* Manage Section */}
      <s-section heading="Manage Enabled Products & Collections">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text tone="subdued">
              Enable Virtual Try-On for collections to automatically activate it for all products, or select individual products for custom settings.
            </s-text>

            <s-grid columns={{ sm: 1, md: 2 }} gap="base">
              {/* Collections Card (Placeholder for now) */}
              <s-box background="bg-surface-secondary" padding="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="headingSm" tone="subdued">Collections</s-text>
                  <s-stack direction="inline" align="center" gap="base">
                    <s-text variant="headingLg" fontWeight="bold">0</s-text>
                    <s-badge tone="info">Inactive</s-badge>
                  </s-stack>
                </s-stack>
              </s-box>

              {/* Products Card */}
              <s-box background="bg-surface-secondary" padding="base" borderRadius="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="headingSm" tone="subdued">Products</s-text>
                  <s-stack direction="inline" align="center" gap="base">
                    <s-text variant="headingLg" fontWeight="bold">{enabledCount}</s-text>
                    <s-badge tone={enabledCount > 0 ? "success" : "subdued"}>{enabledCount > 0 ? "Active" : "Inactive"}</s-badge>
                  </s-stack>
                </s-stack>
              </s-box>
            </s-grid>

            <s-stack direction="inline" align="end" justify="end">
              <s-button variant="primary" onClick={() => navigate("/app/products")}>Manage Products & Collections</s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="At a glance">
        <s-grid columns={{ sm: 1, md: 2, lg: 4 }} gap="base">
          <s-grid-item>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-heading>Storefront Status</s-heading>
                <s-badge tone={isEnabled ? "success" : "warning"}>
                  {isEnabled ? "On" : "Off"}
                </s-badge>
                <s-link href="/app/settings">Manage status</s-link>
              </s-stack>
            </s-box>
          </s-grid-item>
          <s-grid-item>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-heading>Plan</s-heading>
                <s-badge tone="info">{planTier}</s-badge>
                <s-link href="/app/plan">Manage plan</s-link>
              </s-stack>
            </s-box>
          </s-grid-item>
          <s-grid-item>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-heading>Analytics</s-heading>
                <s-text tone="subdued">Requests & conversions</s-text>
                <s-link href="/app/analytics">View analytics</s-link>
              </s-stack>
            </s-box>
          </s-grid-item>
          <s-grid-item>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-heading>Logs</s-heading>
                <s-text tone="subdued">Event stream</s-text>
                <s-link href="/app/logs">View logs</s-link>
              </s-stack>
            </s-box>
          </s-grid-item>
        </s-grid>
      </s-section>

      <s-section slot="aside" heading="Quick actions">
        <s-stack direction="block" gap="base">
          <s-link href="/app/products">
            <s-button variant="primary" fullWidth>Manage Products</s-button>
          </s-link>
          {themeEditorUrl && (
            <s-link href={themeEditorUrl} target="_blank">
              <s-button variant="tertiary" fullWidth>Open Theme Editor</s-button>
            </s-link>
          )}
          <s-link href="/app/settings">
            <s-button variant="tertiary" fullWidth>Settings</s-button>
          </s-link>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How it works">
        <s-paragraph>
          The Try-On button appears only on products you've enabled.
          Customers click the button and are taken to your external VTO
          frontend where they can upload their photo and try on the garment.
        </s-paragraph>
        <s-paragraph>
          <s-text tone="subdued">
            Store: {shop}
          </s-text>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Dashboard error:", error);

  return (
    <s-page heading="Virtual Try-On">
      <s-section>
        <s-banner tone="critical">
          <s-stack direction="block" gap="tight">
            <s-text fontWeight="semibold">
              Something went wrong loading the dashboard
            </s-text>
            <s-paragraph>
              Please try refreshing the page. If the problem persists, contact
              support.
            </s-paragraph>
            <s-paragraph>
              <s-text tone="subdued" variant="bodySm">
                Error:{" "}
                {error?.message || error?.statusText || "Unknown error"}
              </s-text>
            </s-paragraph>
          </s-stack>
        </s-banner>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
