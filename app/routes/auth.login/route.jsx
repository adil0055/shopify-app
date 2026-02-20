import { redirect } from "react-router";
import { login } from "../../shopify.server";

/**
 * Auth login route — handles session re-authorization for the embedded app.
 * No login form is rendered. This route's only job is to call login() which
 * redirects the browser to Shopify OAuth when a valid `shop` param is present.
 *
 * Flow:
 *   authenticate.admin() in app.jsx detects invalid/missing session
 *     → redirects to /auth/login?shop=SHOP&host=HOST
 *     → login(request) reads shop param → returns OAuth redirect to Shopify
 *     → OAuth completes → /auth/callback → session stored → back to /app
 */
export const loader = async ({ request }) => {
  const result = await login(request);

  // login() returns a Response (redirect to Shopify OAuth) when shop param is present.
  // This is the normal re-auth path for embedded apps.
  if (result instanceof Response) return result;

  // No shop param — shouldn't happen in normal embedded flow.
  // Redirect to root so Shopify can re-embed with correct params.
  throw redirect("/");
};

export const action = async ({ request }) => {
  const result = await login(request);
  if (result instanceof Response) return result;
  throw redirect("/");
};

// No UI — this route only performs an OAuth redirect, never renders.
export default function AuthLogin() {
  return null;
}
