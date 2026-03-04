import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  isEmbeddedApp: true,
  future: {},
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });

      const VTO_API_BASE = process.env.VTO_API_BASE_URL;
      // We only want to sync offline tokens to the persistent python database
      if (VTO_API_BASE && !session.isOnline) {
        try {
          const res = await fetch(`${VTO_API_BASE}/merchants`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: session.id,
              shop_domain: session.shop,
              state: session.state,
              is_online: session.isOnline,
              scope: session.scope,
              expires: session.expires ? session.expires.toISOString() : null,
              offline_access_token: session.accessToken,
              user_id: session.userId || null,
              first_name: session.firstName || null,
              last_name: session.lastName || null,
              email: session.email || null,
              account_owner: session.accountOwner || false,
              locale: session.locale || null,
              collaborator: session.collaborator || false,
              email_verified: session.emailVerified || false,
              refresh_token: session.refreshToken || null,
              refresh_token_expires: session.refreshTokenExpires ? session.refreshTokenExpires.toISOString() : null
            }),
          });
          if (res.ok) {
            console.log(`[afterAuth] Successfully synced merchant token for ${session.shop}`);
          } else {
            console.error(`[afterAuth] Failed to sync merchant token. Status: ${res.status}`);
          }
        } catch (err) {
          console.error(`[afterAuth] Network error syncing merchant token:`, err);
        }
      }
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
