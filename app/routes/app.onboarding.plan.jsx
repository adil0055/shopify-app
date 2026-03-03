import { redirect, useLoaderData, useSubmit, useNavigation, useRouteError, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrCreateShopSettings, updatePlanTier } from "../models/shopSettings.server";
import {
    Page, Layout, Card, BlockStack, InlineStack, InlineGrid,
    Text, Badge, Button, Box, Divider
} from "@shopify/polaris";

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
        await updatePlanTier(session.shop, planTier);
    }

    const url = new URL(request.url);
    const searchParams = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
    return redirect(`/app/onboarding/customize${searchParams}`);
};

export default function OnboardingPlan() {
    const { settings } = useLoaderData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const currentPlan = settings.planTier || "FREE";
    const isSubmitting = navigation.state !== "idle";
    const submittingPlanId = navigation.formData?.get("planTier");

    const plans = [
        {
            id: "FREE",
            name: "Free Tier",
            price: "$0",
            period: "/mo",
            features: ["Up to 10 products", "Standard support", "Basic analytics"],
        },
        {
            id: "PRO",
            name: "Pro Plan",
            price: "$29",
            period: "/mo",
            features: ["Unlimited products", "Priority support", "Advanced analytics", "Remove branding"],
            recommended: true,
        },
        {
            id: "ENTERPRISE",
            name: "Enterprise",
            price: "Custom",
            period: "",
            features: ["Custom integration", "Dedicated account manager", "SLA guarantee"],
        },
    ];

    const handleSelect = (planId) => {
        if (isSubmitting) return;
        const formData = new FormData();
        formData.append("planTier", planId);
        submit(formData, { method: "post" });
    };

    return (
        <Card padding="600">
            <BlockStack gap="600">
                <BlockStack gap="200">
                    <Text variant="headingLg" as="h2">Choose your plan</Text>
                    <Text tone="subdued" as="p">Select a plan that fits your business needs. You can change this later.</Text>
                </BlockStack>

                <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
                    {plans.map((plan) => {
                        const isSelected = currentPlan === plan.id;
                        const isLoading = isSubmitting && submittingPlanId === plan.id;

                        return (
                            <Box
                                key={plan.id}
                                borderWidth="025"
                                borderColor={isSelected ? "border-success" : "border"}
                                borderRadius="300"
                                padding="500"
                                background={isSelected ? "bg-surface-success" : "bg-surface"}
                            >
                                <BlockStack gap="400">
                                    <BlockStack gap="200">
                                        {plan.recommended && (
                                            <Badge tone="success">Recommended</Badge>
                                        )}
                                        <Text variant="headingMd" as="h3" fontWeight="bold">{plan.name}</Text>
                                        <InlineStack gap="100" blockAlign="baseline">
                                            <Text variant="headingXl" as="p" fontWeight="bold">{plan.price}</Text>
                                            {plan.period && <Text tone="subdued" as="p">{plan.period}</Text>}
                                        </InlineStack>
                                    </BlockStack>

                                    <Divider />

                                    <BlockStack gap="200">
                                        {plan.features.map((feature, i) => (
                                            <InlineStack key={i} gap="200" blockAlign="center">
                                                <Text tone="success" as="span">✓</Text>
                                                <Text tone="subdued" as="span">{feature}</Text>
                                            </InlineStack>
                                        ))}
                                    </BlockStack>

                                    <Box paddingBlockStart="200">
                                        <Button
                                            variant={isSelected ? "primary" : "secondary"}
                                            fullWidth
                                            disabled={isSubmitting}
                                            loading={isLoading}
                                            onClick={() => handleSelect(plan.id)}
                                        >
                                            {isSelected ? "✓ Selected" : `Choose ${plan.name}`}
                                        </Button>
                                    </Box>
                                </BlockStack>
                            </Box>
                        );
                    })}
                </InlineGrid>
            </BlockStack>
        </Card>
    );
}

export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
