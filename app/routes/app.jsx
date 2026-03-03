import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import enTranslations from "@shopify/polaris/locales/en.json";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

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
    <PolarisAppProvider i18n={enTranslations}>
      <AppProvider embedded apiKey={apiKey}>
        <ui-nav-menu>
          <a href="/app" rel="home">Dashboard</a>
          <a href="/app/settings">Settings</a>
          <a href="/app/analytics">Analytics</a>
          <a href="/app/logs">Logs</a>
          <a href="/app/plan">Plan</a>
        </ui-nav-menu>
        <Outlet />
      </AppProvider>
    </PolarisAppProvider>
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
