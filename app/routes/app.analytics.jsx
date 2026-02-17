import { boundary } from "@shopify/shopify-app-react-router/server";
import { Form, useLoaderData, useNavigation, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import {
  countLogs,
  createSampleLogs,
  groupCountsByDay,
  listLogs,
  summarizeLogsForWindow,
} from "../models/apiLogs.server";

function sinceDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const total = await countLogs(session.shop);

  // Pull enough logs to summarize; for Phase 2 sample-scale this is fine.
  const logs30 = await prismaWindow(session.shop, 30);
  const logs7 = logs30.filter((l) => new Date(l.createdAt) >= sinceDays(7));

  const summary7 = summarizeLogsForWindow(logs7);
  const summary30 = summarizeLogsForWindow(logs30);
  const series14 = groupCountsByDay(logs30, 14);

  // Event type breakdown for pie-style display
  const eventBreakdown = {};
  for (const l of logs30) {
    eventBreakdown[l.eventType] = (eventBreakdown[l.eventType] || 0) + 1;
  }

  return {
    shop: session.shop,
    total,
    summary7,
    summary30,
    series14,
    eventBreakdown,
  };
};

async function prismaWindow(shop, days) {
  const logs = await listLogs(shop, { limit: 1000 });
  const cutoff = sinceDays(days);
  return logs.filter((l) => new Date(l.createdAt) >= cutoff);
}

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "generate_sample") {
    await createSampleLogs(session.shop);
    return { ok: true };
  }

  return { ok: false };
};

/**
 * CSS-based bar chart for daily requests
 */
function BarChart({ data }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "4px",
        height: "180px",
        padding: "8px 0",
        borderBottom: "1px solid var(--p-color-border, #e5e7eb)",
      }}
    >
      {data.map((row) => {
        const pct = Math.max((row.count / maxCount) * 100, 2);
        const dayLabel = row.date.slice(5); // "MM-DD"

        return (
          <div
            key={row.date}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "flex-end",
              height: "100%",
              gap: "4px",
              minWidth: 0,
            }}
          >
            {/* Count label */}
            <span
              style={{
                fontSize: "10px",
                color: "var(--p-color-text-subdued, #6b7280)",
                fontWeight: row.count > 0 ? "600" : "400",
              }}
            >
              {row.count}
            </span>

            {/* Bar */}
            <div
              style={{
                width: "100%",
                maxWidth: "32px",
                height: `${pct}%`,
                minHeight: "3px",
                background:
                  row.count > 0
                    ? "linear-gradient(to top, #3b82f6, #60a5fa)"
                    : "var(--p-color-bg-surface-secondary, #f3f4f6)",
                borderRadius: "4px 4px 0 0",
                transition: "height 0.3s ease",
              }}
              title={`${row.date}: ${row.count} requests`}
            />

            {/* Date label */}
            <span
              style={{
                fontSize: "9px",
                color: "var(--p-color-text-subdued, #9ca3af)",
                transform: "rotate(-45deg)",
                whiteSpace: "nowrap",
                marginTop: "2px",
              }}
            >
              {dayLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Stat card component for summary metrics
 */
function StatCard({ label, value, subValue, tone }) {
  const toneColors = {
    success: "#10b981",
    critical: "#ef4444",
    info: "#3b82f6",
    subdued: "#6b7280",
  };

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="tight">
        <s-text tone="subdued" variant="bodySm">
          {label}
        </s-text>
        <s-text
          fontWeight="bold"
          variant="headingLg"
          style={{ fontSize: "28px" }}
        >
          {value}
        </s-text>
        {subValue && (
          <s-text
            tone={tone || "subdued"}
            variant="bodySm"
            style={
              tone
                ? { color: toneColors[tone] || toneColors.subdued }
                : undefined
            }
          >
            {subValue}
          </s-text>
        )}
      </s-stack>
    </s-box>
  );
}

/**
 * Event breakdown mini-bar
 */
function EventBreakdown({ breakdown }) {
  const entries = Object.entries(breakdown);
  if (entries.length === 0) return null;

  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  const eventColors = {
    REDIRECT_OUT: "#3b82f6",
    VTO_JOB_REQUEST: "#f59e0b",
    VTO_JOB_SUCCESS: "#10b981",
    VTO_JOB_FAILURE: "#ef4444",
  };

  const eventLabels = {
    REDIRECT_OUT: "Redirects",
    VTO_JOB_REQUEST: "Job Requests",
    VTO_JOB_SUCCESS: "Successes",
    VTO_JOB_FAILURE: "Failures",
  };

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-text fontWeight="semibold">Event Breakdown (30 days)</s-text>

        {/* Stacked bar */}
        <div
          style={{
            display: "flex",
            height: "12px",
            borderRadius: "6px",
            overflow: "hidden",
            background: "var(--p-color-bg-surface-secondary, #f3f4f6)",
          }}
        >
          {entries.map(([type, count]) => (
            <div
              key={type}
              style={{
                width: `${(count / total) * 100}%`,
                background: eventColors[type] || "#9ca3af",
                minWidth: count > 0 ? "4px" : "0",
              }}
              title={`${eventLabels[type] || type}: ${count}`}
            />
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {entries.map(([type, count]) => (
            <div
              key={type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: eventColors[type] || "#9ca3af",
                  display: "inline-block",
                  flexShrink: 0,
                }}
              />
              <s-text variant="bodySm">
                {eventLabels[type] || type}: <strong>{count}</strong>
              </s-text>
            </div>
          ))}
        </div>
      </s-stack>
    </s-box>
  );
}

export default function Analytics() {
  const { total, summary7, summary30, series14, eventBreakdown } =
    useLoaderData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const showEmpty = total === 0;

  // Calculate success rate
  const successRate7 =
    summary7.total > 0
      ? Math.round((summary7.successes / summary7.total) * 100)
      : 0;
  const successRate30 =
    summary30.total > 0
      ? Math.round((summary30.successes / summary30.total) * 100)
      : 0;

  return (
    <s-page heading="Analytics">
      <s-section heading="Usage metrics (Phase 2)">
        <s-paragraph>
          Metrics are derived from the log stream. In Phase 3 we'll compute
          these from real VTO lifecycle events and enforce plan limits.
        </s-paragraph>
        <s-paragraph>
          <s-link href="/app/logs">View logs</s-link>
        </s-paragraph>

        {showEmpty ? (
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-heading>No data yet</s-heading>
              <s-paragraph>
                Generate sample logs to preview analytics UI.
              </s-paragraph>
              <Form method="post">
                <input type="hidden" name="intent" value="generate_sample" />
                <s-button
                  variant="primary"
                  type="submit"
                  {...(isSubmitting ? { loading: true } : {})}
                >
                  Generate sample data
                </s-button>
              </Form>
            </s-stack>
          </s-box>
        ) : (
          <s-stack direction="block" gap="loose">
            {/* Summary stat cards */}
            <s-grid>
              <s-grid-item>
                <StatCard
                  label="Total Requests (7d)"
                  value={summary7.total}
                  subValue={`${successRate7}% success rate`}
                  tone={successRate7 >= 90 ? "success" : "critical"}
                />
              </s-grid-item>
              <s-grid-item>
                <StatCard
                  label="Successes (7d)"
                  value={summary7.successes}
                  subValue={`${summary7.failures} failures`}
                  tone="success"
                />
              </s-grid-item>
              <s-grid-item>
                <StatCard
                  label="Total Requests (30d)"
                  value={summary30.total}
                  subValue={`${successRate30}% success rate`}
                  tone={successRate30 >= 90 ? "success" : "critical"}
                />
              </s-grid-item>
              <s-grid-item>
                <StatCard
                  label="All Time"
                  value={total}
                  subValue="Total events logged"
                  tone="info"
                />
              </s-grid-item>
            </s-grid>

            {/* Event breakdown */}
            <EventBreakdown breakdown={eventBreakdown} />
          </s-stack>
        )}
      </s-section>

      {/* Chart */}
      {!showEmpty && (
        <s-section heading="Requests per day (last 14 days)">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <BarChart data={series14} />
          </s-box>

          {/* Data table below chart */}
          <s-box padding="tight">
            <details>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: "13px",
                  color: "var(--p-color-text-subdued, #6b7280)",
                  padding: "8px 0",
                }}
              >
                Show raw data table
              </summary>
              <s-table>
                <s-table-header>
                  <s-table-header-row>
                    <s-table-header-cell>Date</s-table-header-cell>
                    <s-table-header-cell>Requests</s-table-header-cell>
                  </s-table-header-row>
                </s-table-header>
                <s-table-body>
                  {series14.map((row) => (
                    <s-table-row key={row.date}>
                      <s-table-cell>
                        <code>{row.date}</code>
                      </s-table-cell>
                      <s-table-cell>{row.count}</s-table-cell>
                    </s-table-row>
                  ))}
                </s-table-body>
              </s-table>
            </details>
          </s-box>
        </s-section>
      )}

      <s-section slot="aside" heading="Definitions">
        <s-unordered-list>
          <s-list-item>
            <strong>Requests</strong>: number of log events considered
            "attempts" (Phase 2 sample).
          </s-list-item>
          <s-list-item>
            <strong>Success</strong>/<strong>Failure</strong>: derived from log
            status (Phase 3 will use real job lifecycle).
          </s-list-item>
          <s-list-item>
            <strong>Success Rate</strong>: percentage of successful requests out
            of total.
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
  const error = useRouteError();
  console.error("Analytics page error:", error);

  return (
    <s-page heading="Analytics">
      <s-section>
        <s-banner tone="critical">
          <s-stack direction="block" gap="tight">
            <s-text fontWeight="semibold">Failed to load analytics</s-text>
            <s-paragraph>
              Please try refreshing. Error: {error?.message || "Unknown error"}
            </s-paragraph>
          </s-stack>
        </s-banner>
      </s-section>
    </s-page>
  );
}
