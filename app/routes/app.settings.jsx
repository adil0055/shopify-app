import { boundary } from "@shopify/shopify-app-react-router/server";
import { useActionData, useLoaderData, useNavigation, useSubmit, useRouteError } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateShopSettings,
  updateShopSettings,
  updateButtonCustomization,
} from "../models/shopSettings.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getOrCreateShopSettings(session.shop);
  return { shop: session.shop, settings };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "save_appearance") {
    await updateButtonCustomization(session.shop, {
      btnLabel: form.get("btnLabel") || "Try On",
      btnColor: form.get("btnColor") || "#000000",
      btnTextColor: form.get("btnTextColor") || "#ffffff",
      btnBorderRadius: parseInt(form.get("btnBorderRadius") || "4", 10),
    });
    return new Response(JSON.stringify({ ok: true, intent: "save_appearance" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Default: save general settings
  const isEnabled = form.get("isEnabled") === "true";
  const emailCollectionStep = parseInt(form.get("emailCollectionStep") || "2", 10);
  const maxGenerationsPerWeek = parseInt(form.get("maxGenerationsPerWeek") || "6", 10);
  const appLanguage = form.get("appLanguage") || "shopify_default";

  await updateShopSettings(session.shop, {
    vtoBaseUrl: "",
    isEnabled,
    emailCollectionStep,
    maxGenerationsPerWeek,
    dataRetentionDays: 7, // keep existing, just not exposed in UI
    appLanguage,
  });

  return new Response(JSON.stringify({ ok: true, intent: "save_general" }), {
    headers: { "Content-Type": "application/json" },
  });
};

export default function Settings() {
  const { settings } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSavingGeneral = navigation.state !== "idle" && navigation.formData?.get("intent") === "save_general";
  const isSavingAppearance = navigation.state !== "idle" && navigation.formData?.get("intent") === "save_appearance";

  // General settings state
  const [isEnabled, setIsEnabled] = useState(settings.isEnabled ?? true);
  const [emailStep, setEmailStep] = useState(settings.emailCollectionStep ?? 2);
  const [maxGens, setMaxGens] = useState(settings.maxGenerationsPerWeek ?? 6);
  const [language, setLanguage] = useState(settings.appLanguage ?? "shopify_default");

  // Button appearance state
  const [btnLabel, setBtnLabel] = useState(settings.btnLabel || "Try On");
  const [btnColor, setBtnColor] = useState(settings.btnColor || "#000000");
  const [btnTextColor, setBtnTextColor] = useState(settings.btnTextColor || "#ffffff");
  const [btnRadius, setBtnRadius] = useState(settings.btnBorderRadius ?? 4);

  const savedGeneral = actionData?.ok && actionData?.intent === "save_general";
  const savedAppearance = actionData?.ok && actionData?.intent === "save_appearance";

  const handleSaveGeneral = () => {
    if (isSavingGeneral) return;
    const fd = new FormData();
    fd.append("intent", "save_general");
    fd.append("isEnabled", String(isEnabled));
    fd.append("emailCollectionStep", String(emailStep));
    fd.append("maxGenerationsPerWeek", String(maxGens));
    fd.append("appLanguage", language);
    submit(fd, { method: "post" });
  };

  const handleSaveAppearance = () => {
    if (isSavingAppearance) return;
    const fd = new FormData();
    fd.append("intent", "save_appearance");
    fd.append("btnLabel", btnLabel);
    fd.append("btnColor", btnColor);
    fd.append("btnTextColor", btnTextColor);
    fd.append("btnBorderRadius", String(btnRadius));
    submit(fd, { method: "post" });
  };

  return (
    <s-page heading="Settings">
      <s-layout>
        <s-layout-section>
          <s-stack direction="block" gap="loose">

            {/* Success banners */}
            {savedGeneral && (
              <s-banner tone="success" title="General settings saved successfully" />
            )}
            {savedAppearance && (
              <s-banner tone="success" title="Button appearance saved successfully" />
            )}

            {/* ── App Status ── */}
            <s-card>
              <s-stack direction="block" gap="base">
                <s-text variant="headingSm">App Status</s-text>
                <s-text tone="subdued">
                  Enable or disable the Virtual Try-On button across your entire storefront without uninstalling the app.
                </s-text>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}
                  onClick={() => setIsEnabled(v => !v)}
                >
                  <div style={{
                    width: "44px", height: "24px", borderRadius: "12px", cursor: "pointer",
                    backgroundColor: isEnabled ? "#008060" : "#ccc",
                    position: "relative", transition: "background-color 0.2s ease",
                    flexShrink: 0,
                  }}>
                    <div style={{
                      position: "absolute", top: "2px",
                      left: isEnabled ? "22px" : "2px",
                      width: "20px", height: "20px", borderRadius: "50%",
                      backgroundColor: "#fff", transition: "left 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </div>
                  <s-text fontWeight="semibold">
                    {isEnabled ? "Try-On Enabled" : "Try-On Disabled"}
                  </s-text>
                </div>
              </s-stack>
            </s-card>

            {/* ── Email Collection ── */}
            <s-card>
              <s-stack direction="block" gap="base">
                <s-text variant="headingSm">Email Collection</s-text>
                <s-text tone="subdued">
                  Configure when customers are prompted to provide their email address during the try-on experience.
                </s-text>
                <s-select
                  label="Collect email"
                  name="emailCollectionStep"
                  value={String(emailStep)}
                  onChange={(e) => setEmailStep(parseInt(e.target.value))}
                  options={[
                    { label: "Before first try-on (required)", value: "0" },
                    { label: "After 1st try-on", value: "1" },
                    { label: "After 2nd try-on", value: "2" },
                    { label: "After 3rd try-on", value: "3" },
                    { label: "After 5th try-on", value: "5" },
                    { label: "Never", value: "-1" },
                  ]}
                />
              </s-stack>
            </s-card>

            {/* ── Generation Limits ── */}
            <s-card>
              <s-stack direction="block" gap="base">
                <s-text variant="headingSm">Generation Limits</s-text>
                <s-text tone="subdued">
                  Set a weekly cap on how many try-ons a single customer can generate. Resets every 7 days.
                </s-text>
                <s-text-field
                  label="Max weekly try-ons per customer"
                  type="number"
                  value={String(maxGens)}
                  onInput={(e) => setMaxGens(e.target.value)}
                  min="1"
                  max="100"
                  helpText="Default is 6. Set higher for premium plans."
                />
              </s-stack>
            </s-card>

            {/* ── Language Settings ── */}
            <s-card>
              <s-stack direction="block" gap="base">
                <s-text variant="headingSm">Language</s-text>
                <s-text tone="subdued">
                  Override the language of the Try-On interface. Defaults to your Shopify store locale.
                </s-text>
                <s-select
                  label="Interface language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  options={[
                    { label: "Use Shopify store default", value: "shopify_default" },
                    { label: "English", value: "en" },
                    { label: "French (Français)", value: "fr" },
                    { label: "Spanish (Español)", value: "es" },
                    { label: "German (Deutsch)", value: "de" },
                  ]}
                />
              </s-stack>
            </s-card>

            {/* Save General Settings */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div onClick={handleSaveGeneral}>
                <s-button variant="primary" loading={isSavingGeneral}>
                  Save Settings
                </s-button>
              </div>
            </div>

            <s-divider />

            {/* ── Button Appearance ── */}
            <s-card>
              <s-stack direction="block" gap="base">
                <s-stack direction="block" gap="tight">
                  <s-text variant="headingSm">Try-On Button Appearance</s-text>
                  <s-text tone="subdued">
                    Customize how the Try-On button looks on your storefront. These settings can also be overridden per-page in the Theme Editor.
                  </s-text>
                </s-stack>

                <s-grid columns={{ xs: 1, md: 2 }} gap="loose">
                  {/* Controls */}
                  <s-stack direction="block" gap="base">
                    <s-text-field
                      label="Button label"
                      value={btnLabel}
                      onInput={(e) => setBtnLabel(e.target.value)}
                      placeholder="Try On"
                    />

                    <s-stack direction="inline" gap="base">
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "500", marginBottom: "6px", color: "#202223" }}>
                          Background color
                        </label>
                        <input
                          type="color"
                          value={btnColor}
                          onChange={(e) => setBtnColor(e.target.value)}
                          style={{ width: "100%", height: "42px", borderRadius: "4px", border: "1px solid #c9cccf", cursor: "pointer" }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "500", marginBottom: "6px", color: "#202223" }}>
                          Text color
                        </label>
                        <input
                          type="color"
                          value={btnTextColor}
                          onChange={(e) => setBtnTextColor(e.target.value)}
                          style={{ width: "100%", height: "42px", borderRadius: "4px", border: "1px solid #c9cccf", cursor: "pointer" }}
                        />
                      </div>
                    </s-stack>

                    <s-text-field
                      label="Border radius (px)"
                      type="number"
                      value={String(btnRadius)}
                      onInput={(e) => setBtnRadius(parseInt(e.target.value) || 0)}
                      min="0"
                      max="30"
                    />
                  </s-stack>

                  {/* Live preview */}
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: "12px",
                    padding: "32px 16px",
                    background: "#f6f6f7", borderRadius: "8px",
                    border: "1px dashed #c9cccf",
                  }}>
                    <s-text tone="subdued" variant="bodySm">Live Preview</s-text>
                    <button style={{
                      backgroundColor: btnColor,
                      color: btnTextColor,
                      borderRadius: btnRadius + "px",
                      padding: "12px 28px",
                      border: "none",
                      fontSize: "15px",
                      fontWeight: "600",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                      transition: "opacity 0.2s",
                    }}>
                      {btnLabel || "Try On"}
                    </button>
                    <s-text tone="subdued" variant="bodySm">
                      Appearance may vary slightly by theme
                    </s-text>
                  </div>
                </s-grid>
              </s-stack>
            </s-card>

            {/* Save Appearance */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <div onClick={handleSaveAppearance}>
                <s-button variant="primary" loading={isSavingAppearance}>
                  Save Button Appearance
                </s-button>
              </div>
            </div>

          </s-stack>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Settings page error:", error);
  return (
    <s-page heading="Settings">
      <s-section>
        <s-banner tone="critical" title="Failed to load settings">
          <s-text>Please try refreshing. Error: {error?.message || "Unknown error"}</s-text>
        </s-banner>
      </s-section>
    </s-page>
  );
}
