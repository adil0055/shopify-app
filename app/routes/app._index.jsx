import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShopSettings } from "../models/shopSettings.server";
import { getOnboardingStatus, getEnabledProductCount, allProductsHaveImages } from "../models/productVtoConfig.server";
import { shopDomainToStoreHandle } from "../utils/shop.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settings, onboardingStatus, enabledCount, imagesComplete] = await Promise.all([
    getOrCreateShopSettings(shop),
    getOnboardingStatus(shop),
    getEnabledProductCount(shop),
    allProductsHaveImages(shop),
  ]);

  const storeHandle = shopDomainToStoreHandle(shop);

  return {
    shop,
    storeHandle,
    settings,
    onboarding: {
      isComplete: onboardingStatus.isComplete,
      enabledProducts: enabledCount,
      hasProducts: enabledCount > 0,
      hasImages: imagesComplete && enabledCount > 0,
    },
  };
};

export default function Index() {
  const { shop, storeHandle, settings, onboarding } = useLoaderData();
  const hasUrl = Boolean(settings?.vtoBaseUrl);
  const isEnabled = Boolean(settings?.isEnabled);
  const planTier = settings?.planTier || "FREE";

  const themeEditorUrl = storeHandle
    ? `https://admin.shopify.com/store/${storeHandle}/themes/current/editor`
    : null;

  // Calculate setup completion
  const setupSteps = [
    { done: hasUrl, label: "VTO URL configured" },
    { done: onboarding.hasProducts, label: "Products selected" },
    { done: onboarding.hasImages, label: "Images configured" },
  ];
  const completedSteps = setupSteps.filter(s => s.done).length;
  const isSetupComplete = completedSteps === setupSteps.length;

  return (
    <s-page heading="Virtual Try-On">
      {/* Setup progress banner */}
      {!isSetupComplete && (
        <s-section>
          <s-banner tone="warning">
            <s-stack direction="block" gap="tight">
              <s-text fontWeight="semibold">
                Setup Progress: {completedSteps}/{setupSteps.length} steps complete
              </s-text>
              <s-paragraph>
                Complete the onboarding to enable Virtual Try-On on your store.{" "}
                <s-link href="/app/onboarding">Continue Setup →</s-link>
              </s-paragraph>
            </s-stack>
          </s-banner>
        </s-section>
      )}

      {isSetupComplete && (
        <s-section>
          <s-banner tone="success">
            <s-stack direction="block" gap="tight">
              <s-text fontWeight="semibold">🎉 Virtual Try-On is fully configured!</s-text>
              <s-paragraph>
                {onboarding.enabledProducts} product{onboarding.enabledProducts !== 1 ? "s" : ""} are ready for Try-On.
              </s-paragraph>
            </s-stack>
          </s-banner>
        </s-section>
      )}

      <s-section heading="Setup checklist">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            {/* VTO URL */}
            <s-stack direction="inline" gap="base" align="center">
              <s-badge tone={hasUrl ? "success" : "critical"}>
                {hasUrl ? "✓" : "1"}
              </s-badge>
              <s-text fontWeight={hasUrl ? "regular" : "semibold"}>
                Set external VTO URL
              </s-text>
              <s-link href="/app/settings">
                {hasUrl ? "Edit" : "Configure"}
              </s-link>
            </s-stack>

            {/* Product Selection */}
            <s-stack direction="inline" gap="base" align="center">
              <s-badge tone={onboarding.hasProducts ? "success" : "attention"}>
                {onboarding.hasProducts ? "✓" : "2"}
              </s-badge>
              <s-text fontWeight={onboarding.hasProducts ? "regular" : "semibold"}>
                Select products for Try-On
                {onboarding.hasProducts && (
                  <s-text tone="subdued"> ({onboarding.enabledProducts} enabled)</s-text>
                )}
              </s-text>
              <s-link href="/app/onboarding/products">
                {onboarding.hasProducts ? "Edit" : "Select"}
              </s-link>
            </s-stack>

            {/* Image Selection */}
            <s-stack direction="inline" gap="base" align="center">
              <s-badge tone={onboarding.hasImages ? "success" : "attention"}>
                {onboarding.hasImages ? "✓" : "3"}
              </s-badge>
              <s-text fontWeight={onboarding.hasImages ? "regular" : "semibold"}>
                Configure VTO-compatible images
              </s-text>
              <s-link href="/app/onboarding/images">
                {onboarding.hasImages ? "Edit" : "Configure"}
              </s-link>
            </s-stack>

            {/* Theme Block */}
            <s-stack direction="inline" gap="base" align="center">
              <s-badge tone="info">4</s-badge>
              <s-text>Add app block to theme</s-text>
              {themeEditorUrl && (
                <s-link href={themeEditorUrl} target="_blank">
                  Open Theme Editor
                </s-link>
              )}
              <s-link href="/app/onboarding/complete">View instructions</s-link>
            </s-stack>

            {/* Storefront Status */}
            <s-stack direction="inline" gap="base" align="center">
              <s-badge tone={isEnabled ? "success" : "warning"}>
                {isEnabled ? "On" : "Off"}
              </s-badge>
              <s-text>Storefront try-on</s-text>
              <s-link href="/app/settings">Manage</s-link>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="At a glance">
        <s-grid>
          <s-grid-item>
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-heading>Products</s-heading>
                <s-text variant="headingLg">{onboarding.enabledProducts}</s-text>
                <s-text tone="subdued">Enabled for Try-On</s-text>
                <s-link href="/app/onboarding/products">Manage products</s-link>
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
          <s-link href="/app/onboarding">
            <s-button variant={isSetupComplete ? "tertiary" : "primary"} fullWidth>
              {isSetupComplete ? "Edit Configuration" : "Continue Setup"}
            </s-button>
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

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
