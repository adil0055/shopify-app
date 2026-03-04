import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (shop) {
    // 1. Notify External Python Backend to Delete Images and Tokens
    try {
      const VTO_API_BASE = process.env.VTO_API_BASE_URL;

      if (VTO_API_BASE) {
        const response = await fetch(`${VTO_API_BASE}/api/v1/external/merchants/${shop}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          console.error(`External VTO server failed to respond beautifully to uninstallation. Status: ${response.status}`);
        } else {
          console.log(`External Python DB wiped all data/images successfully for ${shop}`);
        }
      }
    } catch (err) {
      console.error(`Critical Failure deleting cloud metadata for ${shop}:`, err);
    }

    try {
      await db.$transaction([
        // 1. Remove all API call logs for this shop
        db.apiCallLog.deleteMany({ where: { shop } }),

        // 2. Remove sessions (last)
        db.session.deleteMany({ where: { shop } }),
      ]);

      console.log(`Cleaned up local DB data for uninstalled shop: ${shop}`);
    } catch (error) {
      console.error(`Error cleaning up DB for ${shop}:`, error);
      // Still try to delete sessions even if other cleanup fails
      try {
        await db.session.deleteMany({ where: { shop } });
      } catch (sessionError) {
        console.error(`Failed to delete sessions for ${shop}:`, sessionError);
      }
    }
  }

  return new Response();
};
