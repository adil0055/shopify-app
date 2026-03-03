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
  const allowGuestAccess = form.get("allowGuestAccess") === "true";

  await updateShopSettings(session.shop, {
    vtoBaseUrl: "",
    isEnabled,
    emailCollectionStep,
    maxGenerationsPerWeek,
    dataRetentionDays: 7, // keep existing, just not exposed in UI
    appLanguage,
    allowGuestAccess,
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
  const [allowGuest, setAllowGuest] = useState(settings.allowGuestAccess ?? false);

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
    fd.append("allowGuestAccess", String(allowGuest));
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

  const PolarisToggle = ({ label, helpText, checked, onChange }) => (
    <div style={{ marginTop: "12px", display: "flex", gap: "16px", alignItems: "flex-start" }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: "44px", height: "24px", borderRadius: "12px", cursor: "pointer",
          backgroundColor: checked ? "#008060" : "#8c9196",
          position: "relative", transition: "background-color 0.2s ease, opacity 0.2s",
          flexShrink: 0,
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)"
        }}
      >
        <div style={{
          position: "absolute", top: "2px",
          left: checked ? "22px" : "2px",
          width: "20px", height: "20px", borderRadius: "50%",
          backgroundColor: "#fff", transition: "left 0.2s ease",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.1)",
        }} />
      </div>
      {(label || helpText) && (
        <div style={{ flex: 1, marginTop: "-2px" }}>
          {label && <div style={{ fontSize: "14px", fontWeight: "600", color: "#202223", marginBottom: "2px", cursor: "pointer" }} onClick={() => onChange(!checked)}>{label}</div>}
          {helpText && <div style={{ fontSize: "13px", color: "#6d7175" }}>{helpText}</div>}
        </div>
      )}
    </div>
  );

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
            <s-card padding="loose">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingMd" fontWeight="semibold">App Status</s-text>
                <s-text tone="subdued">
                  Enable or disable the Virtual Try-On button across your entire storefront without uninstalling the app.
                </s-text>

                <PolarisToggle
                  label={isEnabled ? "Virtual Try-On is Enabled" : "Virtual Try-On is Disabled"}
                  checked={isEnabled}
                  onChange={setIsEnabled}
                  helpText={isEnabled ? "The 'Try On' button will appear on configured product pages." : "The 'Try On' button is completely hidden from the storefront."}
                />
              </s-stack>
            </s-card>

            {/* ── Access Control ── */}
            <s-card padding="loose">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingMd" fontWeight="semibold">Customer Access Control</s-text>
                <s-text tone="subdued">
                  Control who can access the Virtual Try-On feature on your storefront.
                </s-text>

                <PolarisToggle
                  label="Allow guest access"
                  checked={allowGuest}
                  onChange={setAllowGuest}
                  helpText={allowGuest ? "Anyone can use Virtual Try-On. A temporary session saves their photo." : "Only logged-in store customers can use Virtual Try-On. Guests will be asked to log in."}
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
            {/* ── Button Appearance ── */}
            <s-card padding="loose">
              <s-stack direction="block" gap="loose">
                <s-stack direction="block" gap="tight">
                  <s-text variant="headingMd" fontWeight="semibold">Try-On Button Appearance</s-text>
                  <s-text tone="subdued">
                    Customize how the Try-On button looks on your storefront. The preview shows approximate styling.
                  </s-text>
                </s-stack>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", alignItems: "start" }}>
                  {/* Controls */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <s-text-field
                      label="Button label"
                      value={btnLabel}
                      onInput={(e) => setBtnLabel(e.target.value)}
                      placeholder="Try On"
                    />

                    <div style={{ display: "flex", gap: "16px" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: "block", fontSize: "13px", fontWeight: "500", marginBottom: "6px", color: "#202223" }}>
                          Background color
                        </label>
                        <input
                          type="color"
                          value={btnColor}
                          onChange={(e) => setBtnColor(e.target.value)}
                          style={{ width: "100%", height: "40px", borderRadius: "5px", padding: "2px", border: "1px solid #c9cccf", cursor: "pointer", background: "#fff" }}
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
                          style={{ width: "100%", height: "40px", borderRadius: "5px", padding: "2px", border: "1px solid #c9cccf", cursor: "pointer", background: "#fff" }}
                        />
                      </div>
                    </div>

                    <s-text-field
                      label="Border radius (px)"
                      type="number"
                      value={String(btnRadius)}
                      onInput={(e) => setBtnRadius(parseInt(e.target.value) || 0)}
                      min="0"
                      max="30"
                      helpText="Set to 0 for sharp corners, or up to 30 for completely rounded edges."
                    />
                  </div>

                  {/* Live preview */}
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: "16px",
                    padding: "48px 16px",
                    background: "#fdfdfd", borderRadius: "8px",
                    border: "1px solid #e1e3e5",
                  }}>
                    <s-text tone="subdued" variant="bodySm">Widget Preview</s-text>
                    <button style={{
                      backgroundColor: btnColor,
                      color: btnTextColor,
                      borderRadius: btnRadius + "px",
                      padding: "12px 28px",
                      border: "none",
                      fontSize: "14px",
                      fontWeight: "600",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}>
                      {btnLabel || "Try On"}
                    </button>
                    <s-text tone="subdued" variant="bodyXs" align="center" style={{ marginTop: "8px", maxWidth: "200px" }}>
                      May vary slightly depending on your active Shopify Theme CSS.
                    </s-text>
                  </div>
                </div>
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
