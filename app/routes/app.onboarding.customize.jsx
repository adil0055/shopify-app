import { redirect, useNavigate } from "react-router";
import { useLoaderData, useNavigation, useSubmit } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { getOrCreateShopSettings, updateButtonCustomization } from "../models/shopSettings.server";
import {
    Card, BlockStack, InlineGrid, InlineStack,
    Text, TextField, Button, Box
} from "@shopify/polaris";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const settings = await getOrCreateShopSettings(session.shop);
    return { settings };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();

    const updates = {
        btnLabel: formData.get("btnLabel"),
        btnColor: formData.get("btnColor"),
        btnTextColor: formData.get("btnTextColor"),
        btnBorderRadius: parseInt(formData.get("btnBorderRadius") || "4", 10),
    };

    await updateButtonCustomization(session.shop, updates);

    const url = new URL(request.url);
    const searchParams = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
    return redirect(`/app/onboarding/products${searchParams}`);
};

export default function OnboardingCustomize() {
    const { settings } = useLoaderData();
    const navigation = useNavigation();
    const submit = useSubmit();
    const navigate = useNavigate();
    const isSaving = navigation.state !== "idle";

    const [label, setLabel] = useState(settings.btnLabel || "Try On");
    const [color, setColor] = useState(settings.btnColor || "#000000");
    const [textColor, setTextColor] = useState(settings.btnTextColor || "#ffffff");
    const [radius, setRadius] = useState(String(settings.btnBorderRadius ?? 4));

    const handleSave = () => {
        if (isSaving) return;
        const formData = new FormData();
        formData.append("btnLabel", label);
        formData.append("btnColor", color);
        formData.append("btnTextColor", textColor);
        formData.append("btnBorderRadius", radius);
        submit(formData, { method: "post" });
    };

    return (
        <Card padding="600">
            <BlockStack gap="600">
                <BlockStack gap="200">
                    <Text variant="headingLg" as="h2">Customize Appearance</Text>
                    <Text tone="subdued" as="p">Adjust how the "Try On" button looks on your storefront.</Text>
                </BlockStack>

                <InlineGrid columns={{ xs: 1, md: "1fr 1fr" }} gap="500">
                    {/* Controls */}
                    <Card padding="500" background="bg-surface-secondary">
                        <BlockStack gap="400">
                            <Text variant="headingSm" as="h3">Button Settings</Text>

                            <TextField
                                label="Button label"
                                value={label}
                                onChange={setLabel}
                                placeholder="Try On"
                                autoComplete="off"
                            />

                            <InlineGrid columns={2} gap="400">
                                <BlockStack gap="100">
                                    <Text as="p" variant="bodySm" fontWeight="medium">Background colour</Text>
                                    <div style={{ position: "relative" }}>
                                        <input
                                            type="color"
                                            value={color}
                                            onChange={(e) => setColor(e.target.value)}
                                            style={{
                                                width: "100%",
                                                height: "44px",
                                                border: "1px solid var(--p-color-border)",
                                                borderRadius: "var(--p-border-radius-200)",
                                                padding: "2px",
                                                cursor: "pointer",
                                            }}
                                        />
                                    </div>
                                </BlockStack>

                                <BlockStack gap="100">
                                    <Text as="p" variant="bodySm" fontWeight="medium">Text colour</Text>
                                    <input
                                        type="color"
                                        value={textColor}
                                        onChange={(e) => setTextColor(e.target.value)}
                                        style={{
                                            width: "100%",
                                            height: "44px",
                                            border: "1px solid var(--p-color-border)",
                                            borderRadius: "var(--p-border-radius-200)",
                                            padding: "2px",
                                            cursor: "pointer",
                                        }}
                                    />
                                </BlockStack>
                            </InlineGrid>

                            <TextField
                                label="Border radius (px)"
                                type="number"
                                value={radius}
                                onChange={setRadius}
                                min="0"
                                max="30"
                                autoComplete="off"
                            />
                        </BlockStack>
                    </Card>

                    {/* Live Preview */}
                    <Card padding="500" background="bg-surface-secondary">
                        <BlockStack gap="400">
                            <Text variant="headingSm" as="h3">Live preview</Text>
                            <Box
                                background="bg-surface"
                                borderRadius="200"
                                borderWidth="025"
                                borderColor="border"
                                padding="600"
                            >
                                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100px" }}>
                                    <button
                                        style={{
                                            backgroundColor: color,
                                            color: textColor,
                                            borderRadius: `${radius}px`,
                                            padding: "12px 28px",
                                            border: "none",
                                            fontSize: "15px",
                                            fontWeight: "600",
                                            cursor: "pointer",
                                            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                                            transition: "transform 0.1s",
                                        }}
                                    >
                                        {label || "Try On"}
                                    </button>
                                </div>
                            </Box>
                            <Text tone="subdued" variant="bodySm" as="p">
                                Actual appearance may vary slightly depending on your theme.
                            </Text>
                        </BlockStack>
                    </Card>
                </InlineGrid>

                <InlineStack gap="300">
                    <Button onClick={() => navigate("/app/onboarding/plan")}>← Back</Button>
                    <Button variant="primary" onClick={handleSave} loading={isSaving}>
                        Save &amp; Continue →
                    </Button>
                </InlineStack>
            </BlockStack>
        </Card>
    );
}
