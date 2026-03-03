import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData, useRouteError, useNavigate, redirect, useSubmit } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShopSettings } from "../models/shopSettings.server";
import {
  getOnboardingStatus,
  getEnabledProductCount,
  allProductsHaveImages,
  getEnabledProducts,
  bulkDisableProducts,
  updateOnboardingStatus
} from "../models/productVtoConfig.server";
import { shopDomainToStoreHandle } from "../utils/shop.server";
import {
  Page, Layout, Card, BlockStack, InlineStack, InlineGrid,
  Text, Badge, Button, Box, Banner, Divider
} from "@shopify/polaris";

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
    const url = new URL(request.url);
    const searchParams = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
    throw redirect(`/app/onboarding${searchParams}`);
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

  if (intent === "reset_onboarding") {
    await updateOnboardingStatus(session.shop, {
      isComplete: false,
      imagesSelected: false,
      productsSelected: false,
    });
    return redirect("/app/onboarding");
  }

  return { success: false, error: "Unknown action" };
};

export default function Index() {
  const { shop, storeHandle, settings, enabledCount } = useLoaderData();
  const isEnabled = Boolean(settings?.isEnabled);
  const planTier = settings?.planTier || "FREE";
  const navigate = useNavigate();
  const submit = useSubmit();

  const themeEditorUrl = storeHandle
    ? `https://admin.shopify.com/store/${storeHandle}/themes/current/editor`
    : null;

  return (
    <Page title="Virtual Try-On Dashboard">
      <Layout>
        {/* Main content */}
        <Layout.Section>
          <BlockStack gap="500">
            {/* Products stat cards */}
            <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
              <Card padding="500">
                <BlockStack gap="200">
                  <Text tone="subdued" variant="bodySm" as="p">Storefront Status</Text>
                  <Badge tone={isEnabled ? "success" : "warning"} size="medium">
                    {isEnabled ? "Active" : "Inactive"}
                  </Badge>
                  <Button onClick={() => navigate("/app/settings")} variant="plain" size="slim">Manage →</Button>
                </BlockStack>
              </Card>

              <Card padding="500">
                <BlockStack gap="200">
                  <Text tone="subdued" variant="bodySm" as="p">Products Enabled</Text>
                  <Text variant="headingXl" as="p" fontWeight="bold">{enabledCount}</Text>
                  <Button onClick={() => navigate("/app/products")} variant="plain" size="slim">Manage →</Button>
                </BlockStack>
              </Card>

              <Card padding="500">
                <BlockStack gap="200">
                  <Text tone="subdued" variant="bodySm" as="p">Current Plan</Text>
                  <Badge tone="info" size="medium">{planTier}</Badge>
                  <Button onClick={() => navigate("/app/plan")} variant="plain" size="slim">Upgrade →</Button>
                </BlockStack>
              </Card>

              <Card padding="500">
                <BlockStack gap="200">
                  <Text tone="subdued" variant="bodySm" as="p">Analytics</Text>
                  <Text variant="headingMd" as="p">Requests & conversions</Text>
                  <Button onClick={() => navigate("/app/analytics")} variant="plain" size="slim">View →</Button>
                </BlockStack>
              </Card>
            </InlineGrid>

            {/* Manage products section */}
            <Card padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">Manage Products</Text>
                    <Text tone="subdued" as="p">
                      Enable Virtual Try-On for individual products or entire collections.
                    </Text>
                  </BlockStack>
                  <Button variant="primary" onClick={() => navigate("/app/products")}>
                    Manage Products &amp; Collections
                  </Button>
                </InlineStack>

                <Divider />

                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                  <Box
                    background="bg-surface-secondary"
                    borderRadius="200"
                    padding="400"
                  >
                    <BlockStack gap="200">
                      <Text tone="subdued" variant="bodySm" as="p">Collections</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="headingXl" as="p" fontWeight="bold">0</Text>
                        <Badge tone="info">Inactive</Badge>
                      </InlineStack>
                    </BlockStack>
                  </Box>

                  <Box
                    background="bg-surface-secondary"
                    borderRadius="200"
                    padding="400"
                  >
                    <BlockStack gap="200">
                      <Text tone="subdued" variant="bodySm" as="p">Products</Text>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="headingXl" as="p" fontWeight="bold">{enabledCount}</Text>
                        <Badge tone={enabledCount > 0 ? "success" : "subdued"}>
                          {enabledCount > 0 ? "Active" : "Inactive"}
                        </Badge>
                      </InlineStack>
                    </BlockStack>
                  </Box>
                </InlineGrid>
              </BlockStack>
            </Card>

            {/* Logs quick link */}
            <Card padding="500">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">Event Logs</Text>
                  <Text tone="subdued" as="p">Monitor Try-On requests in real time.</Text>
                </BlockStack>
                <Button onClick={() => navigate("/app/logs")}>View Logs</Button>
              </InlineStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Sidebar */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="500">
            <Card padding="500">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Quick Actions</Text>
                <BlockStack gap="300">
                  <Button onClick={() => navigate("/app/products")} variant="primary" fullWidth>
                    Manage Products
                  </Button>
                  {themeEditorUrl && (
                    <Button url={themeEditorUrl} target="_blank" fullWidth>
                      Open Theme Editor
                    </Button>
                  )}
                  <Button onClick={() => navigate("/app/settings")} fullWidth>
                    Settings
                  </Button>
                  <Button
                    tone="critical"
                    fullWidth
                    onClick={() => submit({ intent: "reset_onboarding" }, { method: "post" })}
                  >
                    Reset Onboarding (Dev)
                  </Button>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card padding="500">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">How it works</Text>
                <Text as="p">
                  The Try-On button appears only on products you've enabled. Customers click the button
                  to try on the garment virtually using AI.
                </Text>
                <Divider />
                <Text tone="subdued" variant="bodySm" as="p">Store: {shop}</Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Dashboard error:", error);

  return (
    <Page title="Virtual Try-On">
      <Layout>
        <Layout.Section>
          <Banner tone="critical" title="Something went wrong loading the dashboard">
            <BlockStack gap="200">
              <Text as="p">Please try refreshing the page. If the problem persists, contact support.</Text>
              <Text tone="subdued" variant="bodySm" as="p">
                Error: {error?.message || error?.statusText || "Unknown error"}
              </Text>
            </BlockStack>
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
