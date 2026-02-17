import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    // Clean up ALL shop data to comply with Shopify's data protection requirements
    // and prevent orphaned records.
    try {
      await db.$transaction([
        // 1. Remove all product VTO configurations
        db.productVtoConfig.deleteMany({ where: { shop } }),

        // 2. Remove shop settings
        db.shopSettings.deleteMany({ where: { shop } }),

        // 3. Remove onboarding status
        db.onboardingStatus.deleteMany({ where: { shop } }),

        // 4. Remove all API call logs for this shop
        db.apiCallLog.deleteMany({ where: { shop } }),

        // 5. Remove sessions (last, since we're using it above)
        db.session.deleteMany({ where: { shop } }),
      ]);

      console.log(`Cleaned up all data for uninstalled shop: ${shop}`);
    } catch (error) {
      console.error(`Error cleaning up data for ${shop}:`, error);
      // Still try to delete sessions even if other cleanup fails
      try {
        await db.session.deleteMany({ where: { shop } });
      } catch (sessionError) {
        console.error(
          `Failed to delete sessions for ${shop}:`,
          sessionError
        );
      }
    }
  }

  return new Response();
};
