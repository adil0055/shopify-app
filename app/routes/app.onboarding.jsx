import { Outlet, useLoaderData, useNavigate, useLocation, redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOnboardingStatus, getEnabledProductCount, getProductsNeedingImageSelection } from "../models/productVtoConfig.server";
import { Page, Layout, Card, InlineStack, Text, Box } from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [status, enabledCount, needsImages] = await Promise.all([
    getOnboardingStatus(shop),
    getEnabledProductCount(shop),
    getProductsNeedingImageSelection(shop),
  ]);

  // 🚨 Protect route: if onboarding is done, go to dashboard
  if (status.isComplete) {
    const url = new URL(request.url);
    throw redirect(`/app${url.search}`);
  }

  // Determine current step based on state
  let currentStep = 1;
  if (status.isComplete) {
    currentStep = 5;
  } else if (enabledCount > 0 && needsImages.length === 0) {
    currentStep = 5;
  } else if (enabledCount > 0) {
    currentStep = 4;
  }

  return {
    shop,
    status,
    enabledCount,
    needsImagesCount: needsImages.length,
    currentStep,
  };
};



export default function OnboardingLayout() {
  const { status, enabledCount, needsImagesCount, currentStep } = useLoaderData();
  const location = useLocation();

  // Determine active step from URL
  const getActiveStep = () => {
    if (location.pathname.includes("/plan")) return 1;
    if (location.pathname.includes("/customize")) return 2;
    if (location.pathname.includes("/products")) return 3;
    if (location.pathname.includes("/images")) return 4;
    if (location.pathname.includes("/complete")) return 5;
    return currentStep;
  };

  const activeStep = getActiveStep();

  const steps = [
    {
      id: 1,
      label: "Plan",
      path: "/app/onboarding/plan",
      complete: enabledCount > 0, // Assume plan selected if products enabled
    },
    {
      id: 2,
      label: "Customize",
      path: "/app/onboarding/customize",
      complete: enabledCount > 0, // Assume customized if products enabled
    },
    {
      id: 3,
      label: "Select Products",
      path: "/app/onboarding/products",
      complete: enabledCount > 0,
    },
    {
      id: 4,
      label: "Choose Images",
      path: "/app/onboarding/images",
      complete: enabledCount > 0 && needsImagesCount === 0,
      disabled: enabledCount === 0,
    },
    {
      id: 5,
      label: "Complete",
      path: "/app/onboarding/complete",
      complete: status.isComplete,
      disabled: enabledCount === 0 || needsImagesCount > 0,
    },
  ];

  return (
    <Page title="Try-On Setup">
      <Layout>
        <Layout.Section>
          <Box paddingBlockEnd="400">
            <Card padding="400">
              <InlineStack gap="400" wrap>
                {steps.map((step, index) => {
                  const isDone = step.complete;
                  const isActive = activeStep === step.id;

                  // Calculate colors based on Polaris design tokens
                  let bgColor = "var(--p-color-bg-surface-secondary)";
                  let textColor = "var(--p-color-text)";
                  let borderColor = "var(--p-color-border)";

                  if (isDone) {
                    bgColor = "var(--p-color-bg-fill-success)";
                    textColor = "var(--p-color-text-inverse)";
                    borderColor = "transparent";
                  } else if (isActive) {
                    bgColor = "var(--p-color-bg-fill-info)";
                    textColor = "var(--p-color-text-inverse)";
                    borderColor = "transparent";
                  }

                  return (
                    <InlineStack key={step.id} gap="200" align="center" blockAlign="center">
                      <div style={{
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        backgroundColor: bgColor,
                        color: textColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "bold",
                        fontSize: "12px",
                        border: `1px solid ${borderColor}`,
                        flexShrink: 0
                      }}>
                        {isDone ? "✓" : step.id}
                      </div>
                      <Text fontWeight={isActive ? "bold" : "regular"} tone={(!isDone && !isActive) ? "subdued" : "base"}>
                        {step.label}
                      </Text>
                      {index < steps.length - 1 && (
                        <Box paddingInlineStart="200" paddingInlineEnd="200">
                          <Text tone="subdued">→</Text>
                        </Box>
                      )}
                    </InlineStack>
                  );
                })}
              </InlineStack>
            </Card>
          </Box>
        </Layout.Section>
        <Layout.Section>
          <Outlet />
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
