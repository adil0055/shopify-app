import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;
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
 * Custom Vite plugin to handle CORS for Admin UI Extension API calls.
 * Admin extensions run on extensions.shopifycdn.com and need CORS headers
 * to communicate with our backend. Remix doesn't handle OPTIONS requests,
 * so we intercept them here.
 */
function adminExtensionCors() {
  return {
    name: "admin-extension-cors",
    enforce: "pre", // Ensure this runs before other middlewares
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Only apply to our admin extension API routes
        if (req.url && req.url.includes("/app/api/vto-product-config")) {
          console.log(`[CORS Middleware] Intercepting ${req.method} request to: ${req.url}`);

          const origin = req.headers.origin || "*";
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
          res.setHeader("Access-Control-Max-Age", "86400"); // 24 hours
          res.setHeader("Access-Control-Allow-Credentials", "true");
          // Support Private Network Access if requested
          if (req.headers["access-control-request-private-network"]) {
            res.setHeader("Access-Control-Allow-Private-Network", "true");
          }
          res.setHeader("Access-Control-Allow-Credentials", "true");

          // Handle OPTIONS preflight request directly
          if (req.method === "OPTIONS") {
            console.log(`[CORS Middleware] Handling OPTIONS preflight for: ${req.url}`);
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
    allowedHosts: [host],
    cors: false, // We handle CORS manually in the middleware
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
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
