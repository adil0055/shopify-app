import fs from "fs";
import path from "path";

export const loader = async () => {
  // Read our compiled standalone frontend bundle
  const cssPath = path.resolve("public/vto-bundle.css");
  const jsPath = path.resolve("public/vto-bundle.js");

  let cssContent = "";
  let jsContent = "";

  try {
    if (fs.existsSync(cssPath)) cssContent = fs.readFileSync(cssPath, "utf8");
    if (fs.existsSync(jsPath)) jsContent = fs.readFileSync(jsPath, "utf8");
  } catch (err) {
    console.error("Failed to read standalone VTO bundle files:", err);
  }

  // Construct pure HTML document (NO Remix shell!)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Virtual Try-On</title>
    <link rel="preconnect" href="https://cdn.shopify.com/" />
    <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
    <style>
      body, html { margin: 0; padding: 0; width: 100%; height: 100%; }
      /* Inject standalone CSS bundle */
      ${cssContent}
    </style>
</head>
<body>
    <div id="vto-root"></div>
    <script>
      /* Inject standalone JS bundle */
      ${jsContent}
    </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Important to allow iframe framing from Shopify domains
      "Content-Security-Policy": "frame-ancestors https://*.myshopify.com https://admin.shopify.com;",
    },
  });
};
