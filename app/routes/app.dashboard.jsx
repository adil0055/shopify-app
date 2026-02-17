import { boundary } from "@shopify/shopify-app-react-router/server";
import { useLoaderData, useRouteError, useNavigate } from "react-router";
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

export default function Dashboard() {
    const { shop, storeHandle, settings, onboarding, enabledProductsList } = useLoaderData();
    const hasUrl = Boolean(settings?.vtoBaseUrl);
    const isEnabled = Boolean(settings?.isEnabled);
    const planTier = settings?.planTier || "FREE";
    const enabledCount = onboarding.enabledProducts;

    const navigate = useNavigate();

    const themeEditorUrl = storeHandle
        ? `https://admin.shopify.com/store/${storeHandle}/themes/current/editor`
        : null;

    // Calculate setup completion
    const setupSteps = [
        { done: hasUrl, label: "VTO URL configured" },
        { done: onboarding.hasProducts, label: "Products selected" },
        { done: onboarding.hasImages, label: "Images configured" },
    ];
    const completedSteps = setupSteps.filter((s) => s.done).length;
    const isSetupComplete = completedSteps === setupSteps.length;

    return (
        <s-page heading="Virtual Try-On">
            {/* Setup progress banner */}
            {!isSetupComplete && (
                <s-section>
                    <s-banner tone="warning">
                        <s-stack direction="block" gap="tight">
                            <s-text fontWeight="semibold">
                                Setup Progress: {completedSteps}/{setupSteps.length} steps
                                complete
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
                            <s-text fontWeight="semibold">
                                🎉 Virtual Try-On is fully configured!
                            </s-text>
                            <s-paragraph>
                                {onboarding.enabledProducts} product
                                {onboarding.enabledProducts !== 1 ? "s" : ""} are ready for
                                Try-On.
                            </s-paragraph>
                        </s-stack>
                    </s-banner>
                </s-section>
            )}

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

            <s-section heading="Setup checklist">
                <s-box padding="base" borderWidth="base" borderRadius="base">
                    <s-stack direction="block" gap="base">
                        {/* VTO URL */}
                        <s-stack direction="inline" gap="base" align="center">
                            <s-badge tone={hasUrl ? "success" : "critical"}>
                                {hasUrl ? "✓" : "1"}
                            </s-badge>
                            <div style={{ flex: 1 }}>
                                <s-text fontWeight={hasUrl ? "regular" : "semibold"}>
                                    Set external VTO URL
                                </s-text>
                            </div>
                            <s-button variant="plain" onClick={() => navigate("/app/settings")}>{hasUrl ? "Edit" : "Configure"}</s-button>
                        </s-stack>

                        {/* Product Selection */}
                        <s-stack direction="inline" gap="base" align="center">
                            <s-badge
                                tone={onboarding.hasProducts ? "success" : "attention"}
                            >
                                {onboarding.hasProducts ? "✓" : "2"}
                            </s-badge>
                            <div style={{ flex: 1 }}>
                                <s-text
                                    fontWeight={onboarding.hasProducts ? "regular" : "semibold"}
                                >
                                    Select products for Try-On
                                    {onboarding.hasProducts && (
                                        <s-text tone="subdued">
                                            {" "}
                                            ({onboarding.enabledProducts} enabled)
                                        </s-text>
                                    )}
                                </s-text>
                            </div>
                            <s-button variant="plain" onClick={() => navigate("/app/products")}>{onboarding.hasProducts ? "Edit" : "Select"}</s-button>
                        </s-stack>

                        {/* Image Selection */}
                        <s-stack direction="inline" gap="base" align="center">
                            <s-badge tone={onboarding.hasImages ? "success" : "attention"}>
                                {onboarding.hasImages ? "✓" : "3"}
                            </s-badge>
                            <div style={{ flex: 1 }}>
                                <s-text
                                    fontWeight={onboarding.hasImages ? "regular" : "semibold"}
                                >
                                    Configure VTO-compatible images
                                </s-text>
                            </div>
                            <s-button variant="plain" onClick={() => navigate("/app/onboarding/images")}>{onboarding.hasImages ? "Edit" : "Configure"}</s-button>
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
                            <s-link href="/app/onboarding/complete">
                                View instructions
                            </s-link>
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


        </s-page>
    );
}

// Error boundary for this specific route
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
