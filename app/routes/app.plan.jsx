import { boundary } from "@shopify/shopify-app-react-router/server";
import { Form, useActionData, useLoaderData, useNavigation, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { getOrCreateShopSettings, updatePlanTier } from "../models/shopSettings.server";

const TIERS = [
  {
    key: "FREE",
    title: "Free",
    price: "$0",
    bullets: ["Basic onboarding", "Theme app block", "Sample analytics/logs UI (Phase 2)"],
  },
  {
    key: "PRO",
    title: "Pro",
    price: "TBD",
    bullets: ["Higher usage limits", "Priority processing (Phase 3)", "Advanced analytics (Phase 3)"],
  },
  {
    key: "ENTERPRISE",
    title: "Enterprise",
    price: "TBD",
    bullets: ["SLA + dedicated support", "Custom integrations", "Volume pricing"],
  },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await getOrCreateShopSettings(session.shop);
  return { shop: session.shop, planTier: settings.planTier };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const planTier = String(form.get("planTier") || "");

  if (!["FREE", "PRO", "ENTERPRISE"].includes(planTier)) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid plan." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  await updatePlanTier(session.shop, planTier);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};

export default function Plan() {
  const { planTier } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const error = actionData?.ok === false ? actionData.error : null;
  const saved = actionData?.ok === true;

  return (
    <s-page heading="Plan">
      <s-section>
        <s-banner tone="warning">
          <s-paragraph>
            Billing is a placeholder in Phase 2. Selecting a plan only updates a
            per-shop setting so we can build and review the full admin UX before
            enabling Shopify Billing in Phase 3.
          </s-paragraph>
        </s-banner>
      </s-section>

      <s-section heading="Current plan">
        <s-paragraph>
          Current:{" "}
          <s-badge tone="info">
            {planTier}
          </s-badge>
        </s-paragraph>

        {error && (
          <s-banner tone="critical">
            <s-paragraph>{error}</s-paragraph>
          </s-banner>
        )}
        {saved && (
          <s-banner tone="success">
            <s-paragraph>Saved.</s-paragraph>
          </s-banner>
        )}
      </s-section>

      <s-section heading="Plans">
        <s-grid>
          {TIERS.map((t) => {
            const isCurrent = t.key === planTier;
            return (
              <s-grid-item key={t.key}>
                <s-box padding="base" borderWidth="base" borderRadius="base">
                  <s-stack direction="block" gap="base">
                    <s-heading>
                      {t.title}{" "}
                      {isCurrent ? (
                        <s-badge tone="success">Current</s-badge>
                      ) : (
                        <s-badge tone="subdued">Available</s-badge>
                      )}
                    </s-heading>
                    <s-paragraph>
                      Price: <strong>{t.price}</strong>
                    </s-paragraph>
                    <s-unordered-list>
                      {t.bullets.map((b) => (
                        <s-list-item key={b}>{b}</s-list-item>
                      ))}
                    </s-unordered-list>
                    <Form method="post">
                      <input type="hidden" name="planTier" value={t.key} />
                      <s-button
                        variant={isCurrent ? "tertiary" : "primary"}
                        type="submit"
                        {...(isSaving ? { loading: true } : {})}
                      >
                        {isCurrent ? "Selected" : "Select"}
                      </s-button>
                    </Form>
                  </s-stack>
                </s-box>
              </s-grid-item>
            );
          })}
        </s-grid>
      </s-section>

      <s-section slot="aside" heading="Billing status">
        <s-paragraph>
          Status: <strong>Not connected</strong>
        </s-paragraph>
        <s-paragraph>
          Phase 3 will integrate Shopify Billing and enforce plan limits.
        </s-paragraph>
        <s-paragraph>
          <s-link href="/app/analytics">See usage</s-link>
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Plan page error:", error);

  return (
    <s-page heading="Plan">
      <s-section>
        <s-banner tone="critical">
          <s-stack direction="block" gap="tight">
            <s-text fontWeight="semibold">Failed to load plan details</s-text>
            <s-paragraph>
              Please try refreshing. Error: {error?.message || "Unknown error"}
            </s-paragraph>
          </s-stack>
        </s-banner>
      </s-section>
    </s-page>
  );
}
