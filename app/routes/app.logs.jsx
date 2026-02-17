import { boundary } from "@shopify/shopify-app-react-router/server";
import { Form, useActionData, useLoaderData, useNavigation, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { countLogs, createSampleLogs, listLogs } from "../models/apiLogs.server";

const EVENT_OPTIONS = [
  { label: "All", value: "" },
  { label: "Redirect out", value: "REDIRECT_OUT" },
  { label: "VTO job request (future)", value: "VTO_JOB_REQUEST" },
  { label: "VTO job success (future)", value: "VTO_JOB_SUCCESS" },
  { label: "VTO job failure (future)", value: "VTO_JOB_FAILURE" },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const eventType = url.searchParams.get("eventType") || "";

  const total = await countLogs(session.shop);
  const logs = await listLogs(session.shop, {
    limit: 50,
    ...(eventType ? { eventType } : {}),
  });

  return { shop: session.shop, logs, total, eventType };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "generate_sample") {
    await createSampleLogs(session.shop);
    return { ok: true };
  }

  return { ok: false, error: "Unknown action." };
};

function toneForLog(isSuccess) {
  return isSuccess ? "success" : "critical";
}

function formatTimestamp(d) {
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

export default function Logs() {
  const { logs, total, eventType } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const hasLogs = logs.length > 0;
  const showEmpty = total === 0;
  const error = actionData?.ok === false ? actionData.error : null;

  return (
    <s-page heading="Logs">
      <s-section heading="Filters">
        <s-paragraph>
          Read-only event stream for debugging and analytics. Phase 2 includes a
          sample-data generator until VTO backend integration lands in Phase 3.
        </s-paragraph>

        <Form method="get">
          <s-stack direction="inline" gap="base">
            <s-select name="eventType" label="Event type" value={eventType}>
              {EVENT_OPTIONS.map((o) => (
                <s-option key={o.value} value={o.value}>
                  {o.label}
                </s-option>
              ))}
            </s-select>
            <s-button type="submit">Apply</s-button>
            <s-link href="/app/logs">Reset</s-link>
            <s-link href="/app/analytics">View analytics</s-link>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Recent events (last 50)">
        {error && (
          <s-banner tone="critical">
            <s-paragraph>{error}</s-paragraph>
          </s-banner>
        )}

        {showEmpty ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-heading>No logs yet</s-heading>
              <s-paragraph>
                Once VTO callbacks are integrated (Phase 3), you’ll see real
                lifecycle events here. For now, generate sample logs to review
                the UX.
              </s-paragraph>
              <Form method="post">
                <input type="hidden" name="intent" value="generate_sample" />
                <s-button
                  variant="primary"
                  type="submit"
                  {...(isSubmitting ? { loading: true } : {})}
                >
                  Generate sample logs
                </s-button>
              </Form>
            </s-stack>
          </s-box>
        ) : !hasLogs ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-paragraph>No results for the current filter.</s-paragraph>
            <s-paragraph>
              Try selecting “All”, or generate sample logs if you’re just
              previewing Phase 2.
            </s-paragraph>
          </s-box>
        ) : (
          <s-table>
            <s-table-header>
              <s-table-header-row>
                <s-table-header-cell>Time</s-table-header-cell>
                <s-table-header-cell>Event</s-table-header-cell>
                <s-table-header-cell>Status</s-table-header-cell>
                <s-table-header-cell>Request</s-table-header-cell>
                <s-table-header-cell>Message</s-table-header-cell>
              </s-table-header-row>
            </s-table-header>
            <s-table-body>
              {logs.map((l) => (
                <s-table-row key={l.id}>
                  <s-table-cell>{formatTimestamp(l.createdAt)}</s-table-cell>
                  <s-table-cell>
                    <code>{l.eventType}</code>
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={toneForLog(l.isSuccess)}>
                      {l.isSuccess ? "Success" : "Failure"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <code>{l.requestId || "—"}</code>
                  </s-table-cell>
                  <s-table-cell>{l.message || "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section slot="aside" heading="Notes">
        <s-paragraph>
          Logs are scoped per shop and must not store PII. In Phase 3 we’ll add
          request correlation IDs and signed callbacks from the external VTO
          system.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Logs page error:", error);

  return (
    <s-page heading="Logs">
      <s-section>
        <s-banner tone="critical">
          <s-stack direction="block" gap="tight">
            <s-text fontWeight="semibold">Failed to load logs</s-text>
            <s-paragraph>
              Please try refreshing. Error: {error?.message || "Unknown error"}
            </s-paragraph>
          </s-stack>
        </s-banner>
      </s-section>
    </s-page>
  );
}
