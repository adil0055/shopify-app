import { boundary } from "@shopify/shopify-app-react-router/server";
import { Form, useActionData, useLoaderData, useNavigation, useRouteError } from "react-router";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import {
  getOrCreateShopSettings,
  updateShopSettings,
} from "../models/shopSettings.server";


export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getOrCreateShopSettings(session.shop);
  return { shop: session.shop, settings };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();

  const isEnabled = form.get("isEnabled") === "true";
  const emailCollectionStep = parseInt(form.get("emailCollectionStep") || "2", 10);
  const maxGenerationsPerWeek = parseInt(form.get("maxGenerationsPerWeek") || "6", 10);
  const dataRetentionDays = parseInt(form.get("dataRetentionDays") || "7", 10);
  const appLanguage = form.get("appLanguage") || "shopify_default";

  // vtoBaseUrl is technically required by DB but we can leave it as is or empty string since it's removed from UI
  // We'll just pass existing or empty string in update if we fetched it, but action doesn't have it.
  // Actually, updateShopSettings is an upsert. If we don't pass vtoBaseUrl, it might fail if creating new?
  // But getOrCreate handles creation.
  // The updateShopSettings function we modified expects all fields for `update`.
  // Wait, I updated `updateShopSettings` to include new fields, but did I make vtoBaseUrl optional in `update`?
  // No, I passed `vtoBaseUrl` to the `update` clause.
  // If I don't calculate it here, it will be `undefined`.
  // I should probably fetch existing settings first if I want to preserve it, OR just set it to "" since user said "remove it".
  // Let's set it to "" for now.
  const vtoBaseUrl = "";

  const settings = await updateShopSettings(session.shop, {
    vtoBaseUrl,
    isEnabled,
    emailCollectionStep,
    maxGenerationsPerWeek,
    dataRetentionDays,
    appLanguage,
  });

  return new Response(JSON.stringify({ ok: true, settings }), {
    headers: { "Content-Type": "application/json" },
  });
};

export default function Settings() {
  const { shop, settings } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [isEnabled, setIsEnabled] = useState(settings.isEnabled ?? true);
  const [emailStep, setEmailStep] = useState(settings.emailCollectionStep ?? 2);
  const [maxGens, setMaxGens] = useState(settings.maxGenerationsPerWeek ?? 6);
  const [retention, setRetention] = useState(settings.dataRetentionDays ?? 7);
  const [language, setLanguage] = useState(settings.appLanguage ?? "shopify_default");

  const saved = actionData?.ok === true;

  return (
    <s-page heading="Settings">
      {saved && (
        <s-layout-section>
          <s-banner tone="success" title="Settings saved successfully" />
        </s-layout-section>
      )}

      <s-layout>
        <s-layout-section>
          <Form method="post">
            <s-stack direction="block" gap="loose">
              {/* Master Toggle */}
              <s-card>
                <s-stack direction="block" gap="base">
                  <s-text variant="headingSm">App Status</s-text>
                  <s-checkbox
                    checked={isEnabled}
                    onChange={(e) => setIsEnabled(e.target.checked)}
                    name="isEnabled"
                    value="true"
                  >
                    Enable storefront Try On
                  </s-checkbox>
                  <input type="hidden" name="isEnabled" value={String(isEnabled)} />
                </s-stack>
              </s-card>

              {/* Email Collection */}
              <s-card>
                <s-stack direction="block" gap="base">
                  <s-text variant="headingSm">Try-On Button Settings</s-text>
                  <s-select
                    label="Email Collection Step"
                    name="emailCollectionStep"
                    value={String(emailStep)}
                    onChange={(e) => setEmailStep(parseInt(e.target.value))}
                    options={[
                      { label: "Require before first try-on", value: "0" },
                      { label: "After 1st try-on", value: "1" },
                      { label: "After 2nd try-on", value: "2" },
                      { label: "After 3rd try-on", value: "3" },
                      { label: "After 5th try-on", value: "5" },
                      { label: "Never", value: "-1" }
                    ]}
                  />
                  <s-text tone="subdued">
                    Configure when the email collection form appears to users. Set to 0 to require email before any try-on, or choose when users have completed a certain number of try-ons.
                  </s-text>
                </s-stack>
              </s-card>

              {/* Generation Limits */}
              <s-card>
                <s-stack direction="block" gap="base">
                  <s-text variant="headingSm">Generation Limits</s-text>
                  <s-text-field
                    label="Max Weekly Generations Per User"
                    name="maxGenerationsPerWeek"
                    type="number"
                    value={String(maxGens)}
                    onChange={(e) => setMaxGens(e.target.value)}
                    min="1"
                    max="100"
                  />
                  <s-text tone="subdued">
                    Set the maximum number of try-ons a user can generate. Default is 6. This limit resets weekly for each user.
                  </s-text>
                </s-stack>
              </s-card>

              {/* Data Retention */}
              <s-card>
                <s-stack direction="block" gap="base">
                  <s-text variant="headingSm">Data Retention</s-text>
                  <s-select
                    label="Customer Image Retention"
                    name="dataRetentionDays"
                    value={String(retention)}
                    onChange={(e) => setRetention(parseInt(e.target.value))}
                    options={[
                      { label: "1 day", value: "1" },
                      { label: "3 days", value: "3" },
                      { label: "7 days", value: "7" },
                      { label: "14 days", value: "14" },
                      { label: "30 days", value: "30" }
                    ]}
                  />
                  <s-text tone="subdued">
                    Configure how long customer and generated try-on images are stored. Uploaded photos and generated try-on images are automatically and permanently deleted after this period. Default is 7 days.
                  </s-text>
                </s-stack>
              </s-card>

              {/* Language Settings */}
              <s-card>
                <s-stack direction="block" gap="base">
                  <s-text variant="headingSm">Language Settings</s-text>
                  <s-select
                    label="App Language"
                    name="appLanguage"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    options={[
                      { label: "Use Shopify default", value: "shopify_default" },
                      { label: "English", value: "en" },
                      { label: "French", value: "fr" },
                      { label: "Spanish", value: "es" },
                      { label: "German", value: "de" }
                    ]}
                  />
                  <s-text tone="subdued">
                    Select a language to override the default Shopify locale. Choose 'Use Shopify default' to reset.
                  </s-text>
                </s-stack>
              </s-card>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <s-button variant="primary" submit loading={isSaving}>Save Settings</s-button>
              </div>
            </s-stack>
          </Form>
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
        <s-banner tone="critical">
          <s-stack direction="block" gap="tight">
            <s-text fontWeight="semibold">Failed to load settings</s-text>
            <s-paragraph>
              Please try refreshing. Error: {error?.message || "Unknown error"}
            </s-paragraph>
          </s-stack>
        </s-banner>
      </s-section>
    </s-page>
  );
}
