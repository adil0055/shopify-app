import { useLoaderData, useSubmit, useNavigation, useActionData, redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
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
        return redirect("/app/onboarding/products");
    }

    if (needsImages.length > 0) {
        return redirect("/app/onboarding/images");
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
            return { success: true, message: "Onboarding completed successfully!" };
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

    const isLoading = navigation.state !== "idle";

    const handleComplete = () => {
        const formData = new FormData();
        formData.set("intent", "complete");
        submit(formData, { method: "post" });
    };

    const isComplete = status.isComplete || actionData?.success;

    return (
        <>
            {/* Success banner */}
            {isComplete && (
                <s-section>
                    <s-banner tone="success">
                        <s-stack direction="block" gap="tight">
                            <s-text fontWeight="bold">🎉 Try-On is now configured!</s-text>
                            <s-text>
                                Your customers will see the "Try On" button on {enabledProducts.length} product{enabledProducts.length !== 1 ? "s" : ""}.
                            </s-text>
                        </s-stack>
                    </s-banner>
                </s-section>
            )}

            {/* Configuration summary */}
            <s-section>
                <s-box borderWidth="base" borderRadius="base" padding="loose">
                    <s-stack direction="block" gap="loose">
                        <s-heading>Configuration Summary</s-heading>

                        <s-stack direction="block" gap="base">
                            <s-stack direction="inline" gap="base" align="center">
                                <s-badge tone="success">✓</s-badge>
                                <s-text>{enabledProducts.length} product{enabledProducts.length !== 1 ? "s" : ""} enabled for Try-On</s-text>
                            </s-stack>

                            <s-stack direction="inline" gap="base" align="center">
                                <s-badge tone="success">✓</s-badge>
                                <s-text>VTO-compatible images selected for all products</s-text>
                            </s-stack>

                            <s-stack direction="inline" gap="base" align="center">
                                <s-badge tone="info">ℹ</s-badge>
                                <s-text>Store: {shop}</s-text>
                            </s-stack>
                        </s-stack>
                    </s-stack>
                </s-box>
            </s-section>

            {/* Configured products preview */}
            <s-section>
                <s-box borderWidth="base" borderRadius="base" padding="base">
                    <s-stack direction="block" gap="base">
                        <s-heading variant="headingMd">Enabled Products</s-heading>

                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                            gap: "12px",
                        }}>
                            {enabledProducts.slice(0, 8).map((product) => (
                                <s-box
                                    key={product.id}
                                    borderWidth="base"
                                    borderRadius="base"
                                    padding="tight"
                                >
                                    <s-stack direction="inline" gap="tight" align="center">
                                        {product.selectedImageUrl ? (
                                            <img
                                                src={product.selectedImageUrl}
                                                alt={product.productTitle}
                                                style={{
                                                    width: "40px",
                                                    height: "40px",
                                                    objectFit: "cover",
                                                    borderRadius: "4px",
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: "40px",
                                                height: "40px",
                                                backgroundColor: "var(--p-color-bg-surface-secondary)",
                                                borderRadius: "4px",
                                            }} />
                                        )}
                                        <s-stack direction="block" gap="none">
                                            <s-text fontWeight="medium" truncate>
                                                {product.productTitle}
                                            </s-text>
                                            <s-badge tone="success" size="small">Ready</s-badge>
                                        </s-stack>
                                    </s-stack>
                                </s-box>
                            ))}
                        </div>

                        {enabledProducts.length > 8 && (
                            <s-text tone="subdued">
                                +{enabledProducts.length - 8} more products
                            </s-text>
                        )}
                    </s-stack>
                </s-box>
            </s-section>

            {/* Next steps */}
            <s-section>
                <s-box borderWidth="base" borderRadius="base" padding="loose">
                    <s-stack direction="block" gap="base">
                        <s-heading>Next Steps</s-heading>

                        <s-ordered-list>
                            <s-list-item>
                                <strong>Add the app block to your theme</strong>
                                <s-paragraph>
                                    Go to the Theme Editor and add the "VTO Try On Button" block to your product template.
                                </s-paragraph>
                            </s-list-item>
                            <s-list-item>
                                <strong>Configure your external VTO URL</strong>
                                <s-paragraph>
                                    Set the URL where customers will be redirected for the try-on experience in{" "}
                                    <s-link href="/app/settings">Settings</s-link>.
                                </s-paragraph>
                            </s-list-item>
                            <s-list-item>
                                <strong>Test on your storefront</strong>
                                <s-paragraph>
                                    Visit an enabled product page and click the "Try On" button to verify everything works.
                                </s-paragraph>
                            </s-list-item>
                        </s-ordered-list>
                    </s-stack>
                </s-box>
            </s-section>

            {/* Important notes */}
            <s-section>
                <s-banner tone="info">
                    <s-stack direction="block" gap="tight">
                        <s-text fontWeight="semibold">How it works:</s-text>
                        <s-unordered-list>
                            <s-list-item>
                                The "Try On" button will <strong>only appear</strong> on the products you've enabled
                            </s-list-item>
                            <s-list-item>
                                The <strong>selected image</strong> affects VTO quality — front-facing, full garment images work best
                            </s-list-item>
                            <s-list-item>
                                You can update product selection anytime from the{" "}
                                <s-link href="/app/onboarding/products">Products</s-link> page
                            </s-list-item>
                        </s-unordered-list>
                    </s-stack>
                </s-banner>
            </s-section>

            {/* Actions */}
            <s-section>
                <s-stack direction="inline" gap="base">
                    {!isComplete && (
                        <s-button
                            variant="primary"
                            onClick={handleComplete}
                            disabled={isLoading}
                        >
                            {isLoading ? "Completing..." : "Mark Setup Complete"}
                        </s-button>
                    )}

                    {themeEditorUrl && (
                        <s-link href={themeEditorUrl} target="_blank">
                            <s-button variant={isComplete ? "primary" : "secondary"}>
                                Open Theme Editor →
                            </s-button>
                        </s-link>
                    )}

                    <s-link href="/app/settings">
                        <s-button>Configure VTO URL</s-button>
                    </s-link>

                    <s-link href="/app">
                        <s-button variant="plain">Back to Dashboard</s-button>
                    </s-link>
                </s-stack>
            </s-section>

            {/* Edit links */}
            <s-section>
                <s-stack direction="inline" gap="base">
                    <s-link href="/app/onboarding/products">
                        <s-button variant="plain">← Edit Product Selection</s-button>
                    </s-link>
                    <s-link href="/app/onboarding/images">
                        <s-button variant="plain">← Edit Image Selection</s-button>
                    </s-link>
                </s-stack>
            </s-section>
        </>
    );
}

export function ErrorBoundary() {
    return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
