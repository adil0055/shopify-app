import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// The Shopify CLI injects HOST or SHOPIFY_APP_URL with the current Cloudflare tunnel URL.
// Normalise whichever env var it uses.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const shopifyAppUrl = process.env.SHOPIFY_APP_URL || "http://localhost";
const host = new URL(shopifyAppUrl).hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT) || 8002,
    clientPort: 443,
  };
}

/**
 * CORS plugin for Admin UI Extension API calls.
 */
function adminExtensionCors() {
  return {
    name: "admin-extension-cors",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.includes("/app/api/vto-product-config")) {
          const origin = req.headers.origin || "*";
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
          res.setHeader("Access-Control-Max-Age", "86400");
          res.setHeader("Access-Control-Allow-Credentials", "true");
          if (req.headers["access-control-request-private-network"]) {
            res.setHeader("Access-Control-Allow-Private-Network", "true");
          }
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  server: {
    // ✅ Allow ALL hosts — the Cloudflare tunnel URL rotates every restart.
    // Locking to a specific hostname always breaks when the tunnel changes.
    allowedHosts: "all",
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    // ✅ Set origin so Vite injects absolute URLs into the HTML served through
    // the App Proxy iframe — prevents the storefront 404 on module scripts.
    origin: host !== "localhost" ? shopifyAppUrl : undefined,
    fs: {
      allow: ["app", "node_modules"],
    },
  },
  plugins: [adminExtensionCors(), reactRouter(), tsconfigPaths()],
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
  },
});
