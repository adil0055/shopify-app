import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { getOnboardingStatus, getEnabledProductCount, getProductsNeedingImageSelection } from "../models/productVtoConfig.server";

export const loader = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;

    const [status, enabledCount, needsImages] = await Promise.all([
        getOnboardingStatus(shop),
        getEnabledProductCount(shop),
        getProductsNeedingImageSelection(shop),
    ]);

    const url = new URL(request.url);
    const searchParams = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";

    // Redirect to appropriate step
    if (status.isComplete) {
        return redirect(`/app/onboarding/complete${searchParams}`);
    }

    if (enabledCount > 0 && needsImages.length === 0) {
        return redirect(`/app/onboarding/complete${searchParams}`);
    }

    if (enabledCount > 0) {
        return redirect(`/app/onboarding/images${searchParams}`);
    }

    return redirect(`/app/onboarding/plan${searchParams}`);
};

export default function OnboardingIndex() {
    // This component shouldn't render as loader always redirects
    return null;
}
