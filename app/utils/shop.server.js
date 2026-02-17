export function shopDomainToStoreHandle(shopDomain) {
  // admin.shopify.com uses /store/{handle}/...
  // For *.myshopify.com this is the subdomain. For custom domains we can't know the handle.
  const shop = String(shopDomain || "").trim().toLowerCase();
  if (!shop) return null;
  if (shop.endsWith(".myshopify.com")) return shop.replace(".myshopify.com", "");
  return null;
}



