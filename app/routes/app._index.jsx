import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getOnboardingStatus } from "../models/productVtoConfig.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const status = await getOnboardingStatus(shop);

  const url = new URL(request.url);

  // 🚨 FIRST INSTALL → force onboarding
  if (!status?.isComplete) {
    throw redirect(`/app/onboarding${url.search}`);
  }

  // otherwise go to dashboard
  throw redirect(`/app/dashboard${url.search}`);
};

export default function AppIndex() {
  // This component acts purely as a router and should not render content.
  return null;
}
