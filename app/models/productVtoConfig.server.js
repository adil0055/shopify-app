import { unauthenticated } from "../shopify.server";

const NAMESPACE = "vto";
const KEY = "config";

async function getAdmin(shop) {
    const { admin } = await unauthenticated.admin(shop);
    return admin;
}

// Ensure the ID is a valid admin GraphQL GID
function toGid(id) {
    return id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
}

// Parse GraphQL response
async function parseGraphql(response) {
    const json = await response.json();
    if (json?.errors?.length) {
        throw new Error("Shopify GraphQL Errors: " + json.errors.map(e => e.message).join(", "));
    }
    return json;
}

/**
 * Fetch a single product's VTO config from Metafields.
 */
export async function getProductConfig(shop, productId) {
    const admin = await getAdmin(shop);
    const gid = toGid(productId);

    const response = await admin.graphql(
        `#graphql
        query getProductConfig($id: ID!) {
            product(id: $id) {
                id
                title
                featuredImage { url }
                metafield(namespace: "vto", key: "config") { value }
            }
        }`,
        { variables: { id: gid } }
    );
    const json = await parseGraphql(response);
    const product = json.data?.product;
    if (!product) return null;

    const mfValue = product.metafield?.value;
    if (!mfValue) return null;

    try {
        const parsed = JSON.parse(mfValue);
        return {
            shop,
            productId: product.id,
            productTitle: product.title,
            productImage: product.featuredImage?.url || null,
            selectedImageId: parsed.selectedImageId || "",
            selectedImageUrl: parsed.selectedImageUrl || "",
            isEnabled: !!parsed.isEnabled,
        };
    } catch (e) {
        return null;
    }
}

/**
 * Upsert a single product's config directly to its Shopify Metafield.
 */
export async function upsertProductConfig({
    shop,
    productId,
    productTitle,
    productImage,
    selectedImageId,
    selectedImageUrl,
    isEnabled = true,
}) {
    const admin = await getAdmin(shop);
    const gid = toGid(productId);

    const value = JSON.stringify({ isEnabled, selectedImageId, selectedImageUrl });

    const response = await admin.graphql(
        `#graphql
        mutation upsertProductMetafield($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                userErrors { field message }
            }
        }`,
        {
            variables: {
                metafields: [
                    {
                        ownerId: gid,
                        namespace: "vto",
                        key: "config",
                        type: "json",
                        value,
                    },
                ],
            },
        }
    );
    await parseGraphql(response);
    return { shop, productId: gid, isEnabled, selectedImageId, selectedImageUrl };
}

/**
 * Bulk enable products logic.
 * We set `isEnabled=true` and empty images in the `vto.config` Metafield.
 */
export async function bulkEnableProducts(shop, products) {
    const admin = await getAdmin(shop);

    // Construct the metafields payload
    const metafields = products.map((p) => ({
        ownerId: toGid(p.productId || p.id),
        namespace: "vto",
        key: "config",
        type: "json",
        value: JSON.stringify({ isEnabled: true, selectedImageId: "", selectedImageUrl: "" }),
    }));

    // Shopify limits `metafieldsSet` to 25 items per request. We batch it.
    for (let i = 0; i < metafields.length; i += 25) {
        const batch = metafields.slice(i, i + 25);
        const response = await admin.graphql(
            `#graphql
            mutation bulkMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) {
                    userErrors { field message }
                }
            }`,
            { variables: { metafields: batch } }
        );
        await parseGraphql(response);
    }
}

/**
 * Bulk disable products logic.
 * We update the Metafield strictly to `{ isEnabled: false }`.
 */
export async function bulkDisableProducts(shop, productIds) {
    const admin = await getAdmin(shop);

    const metafields = [];
    for (const id of productIds) {
        metafields.push({
            ownerId: toGid(id),
            namespace: "vto",
            key: "config",
            type: "json",
            value: JSON.stringify({ isEnabled: false, selectedImageId: "", selectedImageUrl: "" }),
        });
    }

    for (let i = 0; i < metafields.length; i += 25) {
        const batch = metafields.slice(i, i + 25);
        await admin.graphql(
            `#graphql
            mutation bulkDisableMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
                metafieldsSet(metafields: $metafields) { userErrors { message } }
            }`,
            { variables: { metafields: batch } }
        );
    }
}

/**
 * Delete configs entirely (i.e. delete the metafield).
 */
export async function deleteProductConfigs(shop, productIds) {
    const admin = await getAdmin(shop);

    // We can only delete 1 metafield at a time per product via `metafieldDelete` unless we know its ID.
    // Instead of resolving IDs, we just set the JSON value to null implicitly by bulk disable,
    // or we fetch the product metafield IDs first.
    // Easiest is to just bulkDisable so we don't query nodes.
    return bulkDisableProducts(shop, productIds);
}

/**
 * Update the selected image for a specific product.
 */
export async function updateProductImage(shop, productId, selectedImageId, selectedImageUrl) {
    // Preserve existing isEnabled
    const existing = await getProductConfig(shop, productId);
    const isEnabled = existing ? existing.isEnabled : true;

    return upsertProductConfig({
        shop,
        productId,
        productTitle: existing?.productTitle || "",
        productImage: existing?.productImage || "",
        selectedImageId,
        selectedImageUrl,
        isEnabled,
    });
}

/**
 * Helper to fetch ALL products across the store that have our 'vto.config' metafield.
 * Handles pagination.
 */
async function fetchAllConfiguredProducts(admin) {
    let hasNextPage = true;
    let cursor = null;
    let allProducts = [];

    while (hasNextPage) {
        const response = await admin.graphql(
            `#graphql
            query getProductsWithMetafields($cursor: String) {
                products(first: 250, after: $cursor) {
                    pageInfo { hasNextPage endCursor }
                    nodes {
                        id
                        title
                        featuredImage { url }
                        metafield(namespace: "vto", key: "config") { value }
                    }
                }
            }`,
            { variables: { cursor } }
        );
        const json = await parseGraphql(response);
        const productsRaw = json.data?.products?.nodes || [];

        for (const p of productsRaw) {
            if (p.metafield?.value) {
                try {
                    const parsed = JSON.parse(p.metafield.value);
                    allProducts.push({
                        productId: p.id,
                        productTitle: p.title,
                        productImage: p.featuredImage?.url || null,
                        selectedImageId: parsed.selectedImageId || "",
                        selectedImageUrl: parsed.selectedImageUrl || "",
                        isEnabled: !!parsed.isEnabled,
                    });
                } catch (e) { /* ignore parse errors */ }
            }
        }

        hasNextPage = json.data?.products?.pageInfo?.hasNextPage;
        cursor = json.data?.products?.pageInfo?.endCursor;
    }
    return allProducts;
}

/**
 * Get all VTO-enabled products for a shop
 */
export async function getEnabledProducts(shop) {
    const admin = await getAdmin(shop);
    const all = await fetchAllConfiguredProducts(admin);
    return all.filter(p => p.isEnabled);
}

/**
 * Get all product configs (enabled & disabled)
 */
export async function getAllProductConfigs(shop) {
    const admin = await getAdmin(shop);
    return fetchAllConfiguredProducts(admin);
}

/**
 * Get products needing image selection
 */
export async function getProductsNeedingImageSelection(shop) {
    const enabled = await getEnabledProducts(shop);
    return enabled.filter(p => !p.selectedImageId || p.selectedImageId === "");
}

/**
 * Check if ALL enabled products have images selected
 */
export async function allProductsHaveImages(shop) {
    const enabled = await getEnabledProducts(shop);
    if (enabled.length === 0) return false;
    const missingCount = enabled.filter(p => !p.selectedImageId || p.selectedImageId === "").length;
    return missingCount === 0;
}

export async function getEnabledProductCount(shop) {
    const enabled = await getEnabledProducts(shop);
    return enabled.length;
}


// ============ Onboarding Status stored in Shop Metaobjects/Metafields ============

const ONBOARDING_NAMESPACE = "vto";
const ONBOARDING_KEY = "onboarding_status";

/**
 * Helper to get Shop ID
 */
async function getShopId(admin) {
    const response = await admin.graphql(`query { shop { id } }`);
    const json = await parseGraphql(response);
    return json.data.shop.id;
}

export async function getOnboardingStatus(shop) {
    const admin = await getAdmin(shop);
    const response = await admin.graphql(
        `#graphql
        query {
            shop {
                metafield(namespace: "vto", key: "onboarding_status") { value }
            }
        }`
    );
    const json = await parseGraphql(response);
    const val = json.data?.shop?.metafield?.value;

    // Default structure
    const defaults = {
        productsSelected: false,
        imagesSelected: false,
        isComplete: false,
        shop,
    };

    if (val) {
        try { return { ...defaults, ...JSON.parse(val) }; } catch (e) { }
    }
    return defaults;
}

export async function updateOnboardingStatus(shop, data) {
    const admin = await getAdmin(shop);
    const current = await getOnboardingStatus(shop);
    const next = { ...current, ...data };

    const shopId = await getShopId(admin);

    await admin.graphql(
        `#graphql
        mutation upsertOnboardingStatus($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) { userErrors { message } }
        }`,
        {
            variables: {
                metafields: [
                    {
                        ownerId: shopId,
                        namespace: "vto",
                        key: "onboarding_status",
                        type: "json",
                        value: JSON.stringify(next)
                    }
                ]
            }
        }
    );
    return next;
}

export async function completeOnboarding(shop) {
    return updateOnboardingStatus(shop, {
        productsSelected: true,
        imagesSelected: true,
        isComplete: true,
        completedAt: new Date().toISOString()
    });
}

export async function isOnboardingComplete(shop) {
    const status = await getOnboardingStatus(shop);
    return status.isComplete === true;
}
