import { redirect } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateShopSettings, updateShopSettings } from "../models/shopSettings.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const settings = await getOrCreateShopSettings(session.shop);
    return { settings };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const planTier = formData.get("planTier");

    if (planTier) {
        await updateShopSettings(session.shop, { planTier });
    }

    // Go to next step
    return redirect("/app/onboarding/customize");
};

export default function OnboardingPlan() {
    const { settings } = useLoaderData();
    const fetcher = useFetcher();
    const currentPlan = settings.planTier || "FREE";
    const isSubmitting = fetcher.state !== "idle";

    const plans = [
        {
            id: "FREE",
            name: "Free Tier",
            price: "$0/mo",
            features: ["Up to 10 products", "Standard Support", "Basic Analytics"],
        },
        {
            id: "PRO",
            name: "Pro Plan",
            price: "$29/mo",
            features: ["Unlimited products", "Priority Support", "Advanced Analytics", "Remove Branding"],
            recommended: true,
        },
        {
            id: "ENTERPRISE",
            name: "Enterprise",
            price: "Contact Us",
            features: ["Custom Integration", "Dedicated Account Manager", "SLA"],
        },
    ];

    return (
        <s-section>
            <s-box padding="loose" borderWidth="base" borderRadius="base">
                <s-stack direction="block" gap="loose">
                    <s-heading>Choose your plan</s-heading>
                    <s-text>Select a plan that fits your business needs. You can change this later.</s-text>

                    <s-grid columns={{ xs: 1, sm: 3 }} gap="base">
                        {plans.map((plan) => (
                            <s-box
                                key={plan.id}
                                padding="base"
                                borderWidth="base"
                                borderRadius="base"
                                borderColor={currentPlan === plan.id ? "emphasis" : "base"}
                                background={currentPlan === plan.id ? "surface-highlight" : "surface"}
                                shadow={currentPlan === plan.id ? "card" : "none"}
                            >
                                <s-stack direction="block" gap="base" align="center">
                                    {plan.recommended && <s-badge tone="success">Recommended</s-badge>}
                                    <s-heading variant="headingMd">{plan.name}</s-heading>
                                    <s-text variant="headingLg">{plan.price}</s-text>

                                    <s-box paddingBlockStart="base" paddingBlockEnd="base">
                                        <s-stack direction="block" gap="tight">
                                            {plan.features.map((feature, i) => (
                                                <s-text key={i} tone="subdued" alignment="center">• {feature}</s-text>
                                            ))}
                                        </s-stack>
                                    </s-box>

                                    <fetcher.Form method="post">
                                        <input type="hidden" name="planTier" value={plan.id} />
                                        <s-button
                                            submit
                                            variant={currentPlan === plan.id ? "primary" : "secondary"}
                                            fullWidth
                                            disabled={isSubmitting}
                                            loading={isSubmitting && fetcher.formData?.get("planTier") === plan.id}
                                        >
                                            {currentPlan === plan.id ? "Selected" : "Choose " + plan.name}
                                        </s-button>
                                    </fetcher.Form>
                                </s-stack>
                            </s-box>
                        ))}
                    </s-grid>
                </s-stack>
            </s-box>
        </s-section>
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
