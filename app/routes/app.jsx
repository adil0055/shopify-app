import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  // authenticate.admin() handles session validation, token refresh, and
  // OAuth redirects. When the session is invalid it throws a Response
  // (redirect to /auth/...). The boundary.error() ErrorBoundary below
  // catches that response and sets the correct headers so App Bridge
  // can do a TOP-LEVEL navigation to OAuth — never loading the login
  // page inside the iframe.
  await authenticate.admin(request);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>

        <s-link href="/app/settings">Settings</s-link>
        <s-divider></s-divider>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/logs">Logs</s-link>
        <s-divider></s-divider>
        <s-link href="/app/plan">Plan</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// CRITICAL: This ErrorBoundary catches the auth redirect thrown by
// authenticate.admin(). boundary.error() sets the correct response
// headers (including X-Shopify-API-Request-Failure-Reauthorize-Url)
// that tell App Bridge to do a top-level OAuth redirect from the
// PARENT window — never inside the iframe.
// DO NOT replace this with a custom error component.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
