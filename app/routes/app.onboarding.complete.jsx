import { useLoaderData, useSubmit, useNavigation, useActionData, redirect, useRouteError, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Layout, Card, BlockStack, InlineStack, Text, Badge, Button, Banner, Box, List, Divider } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
    getEnabledProducts,
    getProductsNeedingImageSelection,
    completeOnboarding,
    getOnboardingStatus,
} from "../models/productVtoConfig.server";
import { shopDomainToStoreHandle } from "../utils/shop.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const [enabledProducts, needsImages, status] = await Promise.all([
        getEnabledProducts(shop),
        getProductsNeedingImageSelection(shop),
        getOnboardingStatus(shop),
    ]);

    // Redirect back if setup is incomplete
    if (enabledProducts.length === 0) {
        const url = new URL(request.url);
        const searchParams = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
        return redirect(`/app/onboarding/products${searchParams}`);
    }

    if (needsImages.length > 0) {
        const url = new URL(request.url);
        const searchParams = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
        return redirect(`/app/onboarding/images${searchParams}`);
    }

    const storeHandle = shopDomainToStoreHandle(shop);
    const themeEditorUrl = storeHandle
        ? `https://admin.shopify.com/store/${storeHandle}/themes/current/editor`
        : null;

    return {
        shop,
        storeHandle,
        themeEditorUrl,
        enabledProducts,
        status,
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    try {
        if (intent === "complete") {
            await completeOnboarding(shop);
            // Use a redirect so App Bridge handles navigation with auth context intact
            const url = new URL(request.url);
            const searchParams = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
            return redirect(`/app/onboarding/complete${searchParams}`);
        }

        return { error: "Unknown action." };
    } catch (error) {
        console.error("Complete onboarding action error:", error);
        return { error: "An error occurred. Please try again." };
    }
};

export default function OnboardingComplete() {
    const {
        shop,
        storeHandle,
        themeEditorUrl,
        enabledProducts,
        status
    } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const navigate = useNavigate();

    const isLoading = navigation.state !== "idle";

    const handleComplete = () => {
        const formData = new FormData();
        formData.set("intent", "complete");
        submit(formData, { method: "post" });
    };

    const isComplete = status.isComplete || actionData?.success;



    return (
        <BlockStack gap="500">
            {/* Success banner */}
            {isComplete && (
                <Banner tone="success">
                    <BlockStack gap="200">
                        <Text as="p" fontWeight="bold">🎉 Try-On is now configured!</Text>
                        <Text as="p">
                            Your customers will see the "Try On" button on {enabledProducts.length} product{enabledProducts.length !== 1 ? "s" : ""}.
                        </Text>
                    </BlockStack>
                </Banner>
            )}

            {/* Configuration summary */}
            <Card padding="500">
                <BlockStack gap="500">
                    <Text variant="headingLg" as="h2">Configuration Summary</Text>

                    <BlockStack gap="300">
                        <InlineStack gap="300" blockAlign="center">
                            <Badge tone="success">✓</Badge>
                            <Text as="span">{enabledProducts.length} product{enabledProducts.length !== 1 ? "s" : ""} enabled for Try-On</Text>
                        </InlineStack>

                        <InlineStack gap="300" blockAlign="center">
                            <Badge tone="success">✓</Badge>
                            <Text as="span">VTO-compatible images selected for all products</Text>
                        </InlineStack>

                        <InlineStack gap="300" blockAlign="center">
                            <Badge tone="info">ℹ</Badge>
                            <Text as="span">Store: {shop}</Text>
                        </InlineStack>
                    </BlockStack>
                </BlockStack>
            </Card>

            {/* Configured products preview */}
            <Card padding="500">
                <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Enabled Products</Text>

                    <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                        gap: "16px",
                    }}>
                        {enabledProducts.slice(0, 8).map((product) => (
                            <div key={product.id} style={{
                                border: "1px solid var(--p-color-border)",
                                borderRadius: "var(--p-border-radius-200)",
                                padding: "var(--p-space-200)",
                            }}>
                                <InlineStack gap="300" blockAlign="center" wrap={false}>
                                    {product.selectedImageUrl ? (
                                        <img
                                            src={product.selectedImageUrl}
                                            alt={product.productTitle}
                                            style={{
                                                width: "48px",
                                                height: "48px",
                                                objectFit: "cover",
                                                borderRadius: "var(--p-border-radius-100)",
                                            }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: "48px",
                                            height: "48px",
                                            backgroundColor: "var(--p-color-bg-surface-secondary)",
                                            borderRadius: "var(--p-border-radius-100)",
                                        }} />
                                    )}
                                    <Box style={{ overflow: "hidden" }}>
                                        <BlockStack gap="100">
                                            <Text fontWeight="medium" truncate as="p">
                                                {product.productTitle}
                                            </Text>
                                            <Badge tone="success" size="small">Ready</Badge>
                                        </BlockStack>
                                    </Box>
                                </InlineStack>
                            </div>
                        ))}
                    </div>

                    {enabledProducts.length > 8 && (
                        <Text tone="subdued" as="p">
                            +{enabledProducts.length - 8} more products
                        </Text>
                    )}
                </BlockStack>
            </Card>

            {/* Next steps */}
            <Card padding="500">
                <BlockStack gap="400">
                    <Text variant="headingLg" as="h2">Next Steps</Text>

                    <List type="number">
                        <List.Item>
                            <Text as="span" fontWeight="bold">Add the app block to your theme</Text>
                            <Box paddingBlockStart="100">
                                <Text as="p">Go to the Theme Editor and add the "VTO Try On Button" block to your product template.</Text>
                            </Box>
                        </List.Item>

                        <List.Item>
                            <Text as="span" fontWeight="bold">Test on your storefront</Text>
                            <Box paddingBlockStart="100">
                                <Text as="p">Visit an enabled product page and click the "Try On" button to verify everything works.</Text>
                            </Box>
                        </List.Item>
                    </List>
                </BlockStack>
            </Card>

            {/* Important notes */}
            <Banner tone="info">
                <BlockStack gap="200">
                    <Text as="p" fontWeight="semibold">How it works:</Text>
                    <List type="bullet">
                        <List.Item>The "Try On" button will <Text as="span" fontWeight="bold">only appear</Text> on the products you've enabled.</List.Item>
                        <List.Item>The <Text as="span" fontWeight="bold">selected image</Text> affects VTO quality — front-facing, full garment images work best.</List.Item>
                        <List.Item>You can update product selection anytime from the Products page.</List.Item>
                    </List>
                </BlockStack>
            </Banner>

            {/* Actions */}
            <Box paddingBlockStart="400">
                <InlineStack gap="300" blockAlign="center">
                    {!isComplete && (
                        <Button
                            variant="primary"
                            onClick={handleComplete}
                            disabled={isLoading}
                        >
                            {isLoading ? "Completing..." : "Mark Setup Complete"}
                        </Button>
                    )}

                    {themeEditorUrl && (
                        <Button url={themeEditorUrl} target="_blank" variant={isComplete ? "primary" : "secondary"}>
                            Open Theme Editor →
                        </Button>
                    )}

                    <Button onClick={() => navigate("/app")}>Back to Dashboard</Button>
                </InlineStack>
            </Box>

            <Divider />

            {/* Edit links */}
            <Box paddingBlockEnd="400">
                <InlineStack gap="300">
                    <Button onClick={() => navigate("/app/onboarding/products")} variant="plain">← Edit Product Selection</Button>
                    <Button onClick={() => navigate("/app/onboarding/images")} variant="plain">← Edit Image Selection</Button>
                </InlineStack>
            </Box>
        </BlockStack>
    );
}

export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
