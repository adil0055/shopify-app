import { redirect } from "react-router";
import { useLoaderData, useNavigation, Form } from "react-router";
import { useState } from "react";
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

    const updates = {
        btnLabel: formData.get("btnLabel"),
        btnColor: formData.get("btnColor"),
        btnTextColor: formData.get("btnTextColor"),
        btnBorderRadius: parseInt(formData.get("btnBorderRadius") || "4", 10),
    };

    await updateShopSettings(session.shop, updates);

    return redirect("/app/onboarding/products");
};

export default function OnboardingCustomize() {
    const { settings } = useLoaderData();
    const navigation = useNavigation();
    const isSaving = navigation.state === "submitting";

    const [label, setLabel] = useState(settings.btnLabel || "Try On");
    const [color, setColor] = useState(settings.btnColor || "#000000");
    const [textColor, setTextColor] = useState(settings.btnTextColor || "#ffffff");
    const [radius, setRadius] = useState(settings.btnBorderRadius || 4);

    return (
        <s-section>
            <s-stack direction="block" gap="loose">
                <s-heading>Customize Appearance</s-heading>
                <s-text>Adjust how the "Try On" button looks on your storefront.</s-text>

                <s-grid columns={{ xs: 1, md: 2 }} gap="loose">
                    <s-box padding="loose" borderWidth="base" borderRadius="base">
                        <Form method="post">
                            <s-stack direction="block" gap="base">
                                <s-text-field
                                    name="btnLabel"
                                    label="Button Label"
                                    value={label}
                                    onInput={(e) => setLabel(e.target.value)}
                                    placeholder="Try On"
                                />

                                <s-stack direction="inline" gap="base" align="center">
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: "block", marginBottom: "4px" }}>Background</label>
                                        <input
                                            type="color"
                                            name="btnColor"
                                            value={color}
                                            onChange={(e) => setColor(e.target.value)}
                                            style={{ width: "100%", height: "40px" }}
                                        />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: "block", marginBottom: "4px" }}>Text Color</label>
                                        <input
                                            type="color"
                                            name="btnTextColor"
                                            value={textColor}
                                            onChange={(e) => setTextColor(e.target.value)}
                                            style={{ width: "100%", height: "40px" }}
                                        />
                                    </div>
                                </s-stack>

                                <s-text-field
                                    type="number"
                                    name="btnBorderRadius"
                                    label="Border Radius (px)"
                                    value={radius}
                                    onInput={(e) => setRadius(e.target.value)}
                                    min="0"
                                    max="30"
                                />

                                <s-box paddingBlockStart="base">
                                    <s-stack direction="inline" gap="base" align="center">
                                        <s-link href="/app/onboarding/plan">
                                            <s-button>Back</s-button>
                                        </s-link>
                                        <s-button submit variant="primary" loading={isSaving}>
                                            Save & Continue →
                                        </s-button>
                                    </s-stack>
                                </s-box>
                            </s-stack>
                        </Form>
                    </s-box>

                    <s-box padding="loose" background="subdued" borderRadius="base" borderColor="base" borderWidth="base">
                        <s-heading variant="headingSm">Live Preview</s-heading>
                        <div style={{
                            marginTop: "16px",
                            padding: "40px",
                            background: "#fff",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            border: "1px dashed #ccc",
                            borderRadius: "8px"
                        }}>
                            <button style={{
                                backgroundColor: color,
                                color: textColor,
                                borderRadius: radius + "px",
                                padding: "12px 24px",
                                border: "none",
                                fontSize: "16px",
                                fontWeight: "bold",
                                cursor: "pointer",
                                boxShadow: "0 2px 5px rgba(0,0,0,0.1)"
                            }}>
                                {label || "Try On"}
                            </button>
                        </div>
                        <s-text tone="subdued" alignment="center" style={{ marginTop: "8px" }}>
                            Note: Actual appearance may vary slightly depending on your theme styles.
                        </s-text>
                    </s-box>
                </s-grid>

            </s-stack>
        </s-section>
    );
}
