import { Outlet, useLoaderData, useNavigate, useLocation, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOnboardingStatus, getEnabledProductCount, getProductsNeedingImageSelection } from "../models/productVtoConfig.server";

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
    throw redirect(`/app/dashboard${url.search}`);
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
    <s-page heading="Try-On Setup">
      <s-section>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="inline" gap="loose">
            {steps.map((step, index) => (
              <s-stack key={step.id} direction="inline" gap="tight" align="center">
                <s-badge
                  tone={
                    step.complete ? "success" :
                      activeStep === step.id ? "info" :
                        "subdued"
                  }
                >
                  {step.complete ? "✓" : step.id}
                </s-badge>
                <s-text fontWeight={activeStep === step.id ? "semibold" : "regular"}>
                  {step.label}
                </s-text>
                {index < steps.length - 1 && (
                  <s-text tone="subdued">→</s-text>
                )}
              </s-stack>
            ))}
          </s-stack>
        </s-box>
      </s-section>

      <Outlet />
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
