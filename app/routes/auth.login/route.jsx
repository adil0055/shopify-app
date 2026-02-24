import { redirect } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }) => {
  const result = await login(request);

  if (result instanceof Response) return result;

  throw redirect("/");
};

export const action = async ({ request }) => {
  const result = await login(request);
  if (result instanceof Response) return result;
  throw redirect("/");
};

export default function AuthLogin() {
  return null;
}
