import { useState, useCallback, useEffect } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData, useRouteError, Form, useNavigate } from "react-router"; // react-router v7
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { Select, Checkbox, BlockStack, InlineStack } from "@shopify/polaris";
import {
    getAllProductConfigs,
    bulkEnableProducts,
    bulkDisableProducts
} from "../models/productVtoConfig.server";

// Queries
const COLLECTIONS_QUERY = `
  query getCollections($first: Int!) {
    collections(first: $first) {
      edges {
        node {
          id
          title
          image {
            url(transform: { maxWidth: 100, maxHeight: 100 })
          }
          productsCount {
            count
          }
        }
      }
    }
  }
`;

const PRODUCTS_QUERY_FORWARD = `
  query getProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          status
          featuredImage {
            url(transform: { maxWidth: 100, maxHeight: 100 })
          }
          images(first: 50) {
            nodes {
              id
              url(transform: { maxWidth: 200, maxHeight: 200 })
              altText
            }
          }
        }
      }
    }
  }
`;

const COLLECTION_PRODUCTS_QUERY = `
  query getCollectionProducts($id: ID!, $first: Int!) {
    collection(id: $id) {
      products(first: $first) {
        edges {
          node {
            id
            title
            featuredImage {
              url
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_IMAGES_QUERY = `
  query getProductImages($id: ID!) {
    product(id: $id) {
      id
      title
      images(first: 50) {
        nodes {
          id
          url(transform: { maxWidth: 400, maxHeight: 400 })
          altText
        }
      }
    }
  }
`;

export const loader = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;
    const url = new URL(request.url);

    // On-demand: fetch images for a specific product when modal opens
    const fetchImagesFor = url.searchParams.get("fetchImagesFor");
    if (fetchImagesFor) {
        const imgResp = await admin.graphql(PRODUCT_IMAGES_QUERY, { variables: { id: fetchImagesFor } });
        const imgData = await imgResp.json();
        const product = imgData.data?.product;
        return {
            imagesOnly: true,
            productId: fetchImagesFor,
            images: product?.images?.nodes || []
        };
    }

    // Params for product pagination
    const searchQuery = url.searchParams.get("q") || "";
    const filterVendor = url.searchParams.get("vendor") || "";
    const filterType = url.searchParams.get("type") || "";
    const after = url.searchParams.get("after") || null;
    const pageSize = 20;

    // 0. Fetch Filters
    const FILTERS_QUERY = `
      query getFilters {
        shop {
          productTypes(first: 50) { edges { node } }
          productVendors(first: 50) { edges { node } }
        }
      }
    `;
    const filtersResp = await admin.graphql(FILTERS_QUERY);
    const filtersData = await filtersResp.json();
    const productTypes = filtersData.data?.shop?.productTypes?.edges?.map(e => e.node).filter(Boolean) || [];
    const productVendors = filtersData.data?.shop?.productVendors?.edges?.map(e => e.node).filter(Boolean) || [];

    // 1. Fetch Collections (limit 50 for now)
    const collectionsResp = await admin.graphql(COLLECTIONS_QUERY, { variables: { first: 50 } });
    const collectionsData = await collectionsResp.json();
    const collections = collectionsData.data?.collections?.edges?.map(e => ({
        ...e.node,
        productsCount: e.node.productsCount?.count || 0
    })) || [];

    // 2. Fetch Products
    let queryParts = [];
    if (searchQuery) queryParts.push(`title:*${searchQuery}*`);
    if (filterVendor) queryParts.push(`vendor:'${filterVendor}'`);
    if (filterType) queryParts.push(`product_type:'${filterType}'`);
    const shopifyQuery = queryParts.length > 0 ? queryParts.join(" AND ") : null;

    const productsResp = await admin.graphql(PRODUCTS_QUERY_FORWARD, {
        variables: { first: pageSize, after, query: shopifyQuery }
    });
    const productsData = await productsResp.json();
    const products = productsData.data?.products?.edges?.map(e => e.node) || [];
    const pageInfo = productsData.data?.products?.pageInfo || {};

    // 3. Fetch Local Configs
    const existingConfigs = await getAllProductConfigs(shop);
    const enabledConfigs = existingConfigs.filter(c => c.isEnabled);
    const enabledProductIds = new Set(enabledConfigs.map(c => c.productId));
    const configMap = new Map(enabledConfigs.map(c => [c.productId, c]));

    // 4. Create Active VTO Products array rich with DB data
    const activeVtoProducts = enabledConfigs.map(config => {
        // Try to find the detailed product in the Shopify GraphQL response (if it happened to be on the current page)
        const detailedProduct = products.find(p => p.id === config.productId);
        return {
            id: config.productId,
            title: config.productTitle || (detailedProduct ? detailedProduct.title : "Product Name"),
            featuredImageUrl: config.productImage,
            selectedImageId: config.selectedImageId,
            selectedImageUrl: config.selectedImageUrl,
            missingImage: !config.selectedImageId,
            // Fallback for Shopify images if it was in the current page
            images: detailedProduct ? detailedProduct.images?.nodes : []
        };
    });

    // Merge status into paginated products
    const productsWithStatus = products.map(p => {
        const config = configMap.get(p.id);
        const selectedImageId = config?.selectedImageId;
        const missingImage = Boolean(config && !selectedImageId);

        let selectedImageUrl = config?.selectedImageUrl;
        if (selectedImageId && p.images?.nodes) {
            const found = p.images.nodes.find(img => img.id === selectedImageId);
            if (found) selectedImageUrl = found.url;
        }

        return {
            ...p,
            isEnabled: enabledProductIds.has(p.id),
            missingImage,
            selectedImageId,
            selectedImageUrl,
            images: p.images?.nodes || []
        };
    });

    return {
        collections,
        products: productsWithStatus,
        activeVtoProducts,
        pageInfo,
        searchQuery,
        filterVendor,
        filterType,
        productTypes,
        productVendors,
        enabledCount: enabledProductIds.size
    };
};

export const action = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    if (intent === "enable_product") {
        const productId = formData.get("productId");
        const productTitle = formData.get("productTitle");
        const productImage = formData.get("productImage");

        await bulkEnableProducts(shop, [{ productId, productTitle, productImage }]);
        return { success: true, message: "Product enabled" };
    }

    if (intent === "disable_product") {
        const productId = formData.get("productId");
        await bulkDisableProducts(shop, [productId]);
        return { success: true, message: "Product disabled" };
    }

    if (intent === "bulk_enable_products") {
        const payloadStr = formData.get("payload");
        if (!payloadStr) return { error: "Missing payload" };
        const payload = JSON.parse(payloadStr);
        if (payload.length > 0) {
            await bulkEnableProducts(shop, payload);
            return { success: true, message: `Enabled ${payload.length} products for Virtual Try-On.` };
        }
        return { error: "No products selected" };
    }

    if (intent === "enable_collection") {
        const collectionId = formData.get("collectionId");
        // Fetch products in this collection
        const resp = await admin.graphql(COLLECTION_PRODUCTS_QUERY, {
            variables: { id: collectionId, first: 50 } // Limit 50 for demo
        });
        const data = await resp.json();
        const products = data.data?.collection?.products?.edges?.map(e => e.node) || [];

        if (products.length > 0) {
            await bulkEnableProducts(shop, products.map(p => ({
                productId: p.id,
                productTitle: p.title,
                productImage: p.featuredImage?.url
            })));
            return { success: true, message: `Enabled ${products.length} products from collection.` };
        }
        return { error: "No products found in collection" };
    }

    if (intent === "select_image") {
        const productId = formData.get("productId");
        const imageId = formData.get("imageId");
        const imageUrl = formData.get("imageUrl");

        // We need to upsert this into the config.
        // We can use the existing `bulkEnableProducts` or a more specific function.
        // But `bulkEnableProducts` expects productTitle/Image too. 
        // Let's import `updateProductImage` from `models/productVtoConfig.server` if available.
        // Wait, I need to check if `updateProductImage` is exported.
        // It was used in `app.onboarding.images.jsx`.
        const { updateProductImage } = await import("../models/productVtoConfig.server");

        await updateProductImage(shop, productId, imageId, imageUrl);
        return { success: true, message: "Image updated." };
    }

    return { error: "Unknown action" };
};

export default function ManageProducts() {
    const {
        collections, products, activeVtoProducts, pageInfo,
        searchQuery, filterVendor, filterType, productTypes, productVendors, enabledCount
    } = useLoaderData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const actionData = useActionData();
    const navigate = useNavigate();

    // Default to 'active' view to distinguish from onboarding list
    const [activeTab, setActiveTab] = useState("active"); // 'active' | 'collections' | 'products'
    const [localSearch, setLocalSearch] = useState(searchQuery || "");
    const [localVendor, setLocalVendor] = useState(filterVendor || "");
    const [localType, setLocalType] = useState(filterType || "");
    const [selectedProducts, setSelectedProducts] = useState(new Set());

    const isLoading = navigation.state !== "idle";

    // Search handlers
    const handleSearch = useCallback(() => {
        submit({ q: localSearch, vendor: localVendor, type: localType }, { method: "get" });
        setSelectedProducts(new Set());
    }, [localSearch, localVendor, localType, submit]);

    const handleNextPage = () => {
        if (pageInfo.hasNextPage) {
            submit({
                q: searchQuery,
                vendor: filterVendor,
                type: filterType,
                after: pageInfo.endCursor
            }, { method: "get" });
        }
    };

    // Checkbox and Bulk Actions
    const toggleProduct = (id) => {
        const next = new Set(selectedProducts);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedProducts(next);
    };

    const toggleAll = () => {
        if (selectedProducts.size === products.length) {
            setSelectedProducts(new Set());
        } else {
            setSelectedProducts(new Set(products.map(p => p.id)));
        }
    };

    const handleBulkEnable = () => {
        const productsToEnable = products.filter(p => selectedProducts.has(p.id));
        const formData = new FormData();
        formData.append("intent", "bulk_enable_products");
        formData.append("payload", JSON.stringify(productsToEnable.map(p => ({
            productId: p.id,
            productTitle: p.title,
            productImage: p.featuredImage?.url || ""
        }))));
        submit(formData, { method: "post" });
        setSelectedProducts(new Set());
    };

    const handleProductToggle = (p, intent) => {
        const formData = new FormData();
        formData.append("intent", intent);
        formData.append("productId", p.id);
        if (intent === "enable_product") {
            formData.append("productTitle", p.title);
            formData.append("productImage", p.featuredImage?.url || "");
        }
        submit(formData, { method: "post" });
    };

    const [selectedProductForImage, setSelectedProductForImage] = useState(null);
    const [loadingImages, setLoadingImages] = useState(false);

    const handleImageSelect = async (p) => {
        // If we already have this product's images loaded, open immediately
        if (p.images && p.images.length > 0) {
            setSelectedProductForImage(p);
            return;
        }
        // Otherwise fetch images on-demand for this specific product
        setLoadingImages(true);
        try {
            const resp = await fetch(`/app/products?fetchImagesFor=${encodeURIComponent(p.id)}`, {
                headers: { Accept: "application/json" }
            });
            const data = await resp.json();
            setSelectedProductForImage({ ...p, images: data.images || [] });
        } catch {
            setSelectedProductForImage({ ...p, images: [] });
        } finally {
            setLoadingImages(false);
        }
    };

    const handleSaveImage = (p, image) => {
        const formData = new FormData();
        formData.append("intent", "select_image");
        formData.append("productId", p.id);
        formData.append("imageId", image.id);
        formData.append("imageUrl", image.url);
        submit(formData, { method: "post" });
        setSelectedProductForImage(null);
    };

    return (
        <s-page heading="Manage Products & Collections" backAction="/app">
            {/* Image Selection Modal Overlay */}
            {loadingImages && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.4)", zIndex: 1000,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                    <s-spinner />
                </div>
            )}
            {selectedProductForImage && (
                <div style={{
                    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                    background: "rgba(0,0,0,0.5)", zIndex: 1000,
                    display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                    <s-box
                        background="bg-surface"
                        padding="none"
                        borderRadius="base"
                        overflow="hidden"
                        style={{ maxWidth: "800px", width: "90%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
                    >
                        {/* Header */}
                        <div style={{ padding: "16px", borderBottom: "1px solid #e1e3e5", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff" }}>
                            <s-text variant="headingMd" fontWeight="semibold">Select VTO Image</s-text>
                            <s-button variant="plain" onClick={() => setSelectedProductForImage(null)}>✕</s-button>
                        </div>

                        {/* Content */}
                        <div style={{ padding: "20px", overflowY: "auto", flex: 1, background: "#fff" }}>
                            <s-stack direction="block" gap="base">
                                <s-banner tone="info">
                                    <s-text>Select a <strong>clear, front-facing garment-only image</strong>. Images with models or distracting backgrounds are not qualified for Virtual Try-On.</s-text>
                                </s-banner>

                                {selectedProductForImage.images?.length === 0 ? (
                                    <s-stack align="center" padding="loose">
                                        <s-text tone="subdued">No images found for this product.</s-text>
                                    </s-stack>
                                ) : (
                                    <div style={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                                        gap: "12px"
                                    }}>
                                        {selectedProductForImage.images?.map(img => {
                                            const isSelected = selectedProductForImage.selectedImageId === img.id;
                                            return (
                                                <div
                                                    key={img.id}
                                                    onClick={() => handleSaveImage(selectedProductForImage, img)}
                                                    style={{
                                                        cursor: "pointer",
                                                        border: isSelected ? "3px solid #008060" : "1px solid #e1e3e5",
                                                        borderRadius: "8px",
                                                        overflow: "hidden",
                                                        position: "relative",
                                                        transition: "all 0.2s ease",
                                                        backgroundColor: "#f9fafb"
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!isSelected) e.currentTarget.style.borderColor = "#5c5f62";
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isSelected) e.currentTarget.style.borderColor = "#e1e3e5";
                                                    }}
                                                >
                                                    <div style={{ width: "100%", paddingBottom: "125%", position: "relative" }}>
                                                        <img
                                                            src={img.url}
                                                            alt={img.altText || "Product Image"}
                                                            style={{
                                                                position: "absolute", top: 0, left: 0,
                                                                width: "100%", height: "100%",
                                                                objectFit: "contain", padding: "8px"
                                                            }}
                                                        />
                                                    </div>
                                                    {isSelected && (
                                                        <div style={{
                                                            position: "absolute", top: "8px", right: "8px",
                                                            background: "#008060", color: "white",
                                                            borderRadius: "50%", width: "24px", height: "24px",
                                                            display: "flex", alignItems: "center", justifyContent: "center",
                                                            fontSize: "14px", fontWeight: "bold"
                                                        }}>✓</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </s-stack>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: "16px", borderTop: "1px solid #e1e3e5", background: "#f9fafb", display: "flex", justifyContent: "flex-end" }}>
                            <s-button onClick={() => setSelectedProductForImage(null)}>Cancel</s-button>
                        </div>
                    </s-box>
                </div>
            )}

            {/* Feedback */}
            {actionData?.message && (
                <s-section>
                    <s-banner tone="success" dismissible>{actionData.message}</s-banner>
                </s-section>
            )}

            {/* Tabs Navigation */}
            <s-section>
                <s-stack direction="inline" gap="base">
                    <s-button
                        variant={activeTab === "active" ? "primary" : "tertiary"}
                        onClick={() => setActiveTab("active")}
                    >
                        Active VTO Products ({enabledCount})
                    </s-button>
                    <s-button
                        variant={activeTab === "products" ? "primary" : "tertiary"}
                        onClick={() => setActiveTab("products")}
                    >
                        Store Products
                    </s-button>
                    <s-button
                        variant={activeTab === "collections" ? "primary" : "tertiary"}
                        onClick={() => setActiveTab("collections")}
                    >
                        Collections
                    </s-button>
                </s-stack>
            </s-section>

            {/* Content Area */}
            {activeTab === "active" ? (
                <s-section title="Active VTO Products">
                    {activeVtoProducts.length === 0 ? (
                        <s-box padding="loose" borderWidth="base" borderRadius="base" background="bg-surface">
                            <s-stack direction="block" align="center" gap="base">
                                <s-text variant="headingMd">No Active Products</s-text>
                                <s-text tone="subdued">Enable products from your store to activate Virtual Try-On.</s-text>
                                <s-button variant="primary" onClick={() => setActiveTab("products")}>Add Products</s-button>
                            </s-stack>
                        </s-box>
                    ) : (
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                            gap: "20px"
                        }}>
                            {activeVtoProducts.map(p => (
                                <s-box key={p.id} padding="base" borderWidth="base" borderRadius="base" background="bg-surface" overflow="hidden" style={{ display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ position: 'relative', width: '100%', paddingBottom: '100%', backgroundColor: '#f9fafb', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                                        {p.selectedImageUrl || p.featuredImageUrl ? (
                                            <img
                                                src={p.selectedImageUrl || p.featuredImageUrl}
                                                alt={p.title}
                                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', padding: '16px' }}
                                            />
                                        ) : (
                                            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <s-text tone="subdued">No Image</s-text>
                                            </div>
                                        )}
                                        {p.missingImage && (
                                            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                                                <s-badge tone="attention">Needs Image</s-badge>
                                            </div>
                                        )}
                                    </div>
                                    <s-text fontWeight="semibold" variant="bodyLg" style={{ marginBottom: "8px" }}>{p.title}</s-text>
                                    <s-stack direction="inline" align="center" gap="base" justify="space-between" style={{ marginTop: 'auto' }}>
                                        {/* Since GraphQL isn't deep loading images here by default if they weren't in current page, 
                                            we rely on the main products tab for full image selection if missing nodes. 
                                            But we can still allow navigation. */}
                                        <s-button
                                            variant="secondary"
                                            disabled={loadingImages}
                                            onClick={() => handleImageSelect(p)}
                                        >
                                            Change Image
                                        </s-button>
                                        <s-button
                                            variant="plain"
                                            tone="critical"
                                            disabled={isLoading}
                                            onClick={() => handleProductToggle(p, "disable_product")}
                                        >
                                            Disable
                                        </s-button>
                                    </s-stack>
                                </s-box>
                            ))}
                        </div>
                    )}
                </s-section>
            ) : activeTab === "collections" ? (
                <s-section title="Add from Collections">
                    <s-box padding="none" borderWidth="base" borderRadius="base" overflow="hidden">
                        <s-table>
                            <s-table-header>
                                <s-table-header-row>
                                    <s-table-header-cell>Collection</s-table-header-cell>
                                    <s-table-header-cell>Products</s-table-header-cell>
                                    <s-table-header-cell>Action</s-table-header-cell>
                                </s-table-header-row>
                            </s-table-header>
                            <s-table-body>
                                {collections.map(c => (
                                    <s-table-row key={c.id}>
                                        <s-table-cell>
                                            <s-stack direction="inline" align="center" gap="base">
                                                {c.image ? (
                                                    <img src={c.image.url} style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: 40, height: 40, background: '#eee', borderRadius: 4 }} />
                                                )}
                                                <s-text fontWeight="semibold">{c.title}</s-text>
                                            </s-stack>
                                        </s-table-cell>
                                        <s-table-cell>{c.productsCount} products</s-table-cell>
                                        <s-table-cell>
                                            <s-form method="post">
                                                <input type="hidden" name="intent" value="enable_collection" />
                                                <input type="hidden" name="collectionId" value={c.id} />
                                                <s-button submit disabled={isLoading}>Enable All</s-button>
                                            </s-form>
                                        </s-table-cell>
                                    </s-table-row>
                                ))}
                            </s-table-body>
                        </s-table>
                    </s-box>
                </s-section>
            ) : (
                <s-section title="Browse Store Products">
                    <s-stack direction="block" gap="base">
                        {/* Search and Filters */}
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <s-text-field
                                    value={localSearch}
                                    onChange={(e) => setLocalSearch(e.target.value)}
                                    placeholder="Search specific products..."
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                                <Select
                                    labelHidden
                                    label="Brand"
                                    options={[
                                        { label: 'All Brands', value: '' },
                                        ...productVendors.map(v => ({ label: v, value: v }))
                                    ]}
                                    onChange={(val) => setLocalVendor(val)}
                                    value={localVendor}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                                <Select
                                    labelHidden
                                    label="Category"
                                    options={[
                                        { label: 'All Categories', value: '' },
                                        ...productTypes.map(pt => ({ label: pt, value: pt }))
                                    ]}
                                    onChange={(val) => setLocalType(val)}
                                    value={localType}
                                />
                            </div>
                            <s-button onClick={handleSearch} disabled={isLoading} variant="primary">Filter</s-button>
                        </div>

                        {/* Bulk Actions */}
                        {selectedProducts.size > 0 && (
                            <div style={{ background: '#f4f6f8', padding: '12px', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <s-text fontWeight="semibold">{selectedProducts.size} product(s) selected</s-text>
                                <s-button variant="primary" onClick={handleBulkEnable} disabled={isLoading}>Bulk Enable VTON</s-button>
                            </div>
                        )}

                        {/* Products Table */}
                        <s-box padding="none" borderWidth="base" borderRadius="base" overflow="hidden">
                            <s-table>
                                <s-table-header>
                                    <s-table-header-row>
                                        <s-table-header-cell style={{ width: '40px', padding: '12px', verticalAlign: 'middle', textAlign: 'center' }}>
                                            <Checkbox
                                                checked={products.length > 0 && selectedProducts.size === products.length}
                                                onChange={toggleAll}
                                                label="Select All"
                                                labelHidden
                                            />
                                        </s-table-header-cell>
                                        <s-table-header-cell>Product</s-table-header-cell>
                                        <s-table-header-cell>Status</s-table-header-cell>
                                        <s-table-header-cell>VTO Image</s-table-header-cell>
                                        <s-table-header-cell>Action</s-table-header-cell>
                                    </s-table-header-row>
                                </s-table-header>
                                <s-table-body>
                                    {products.map(p => (
                                        <s-table-row key={p.id}>
                                            <s-table-cell style={{ padding: '12px', verticalAlign: 'middle', textAlign: 'center' }}>
                                                <Checkbox
                                                    checked={selectedProducts.has(p.id)}
                                                    onChange={(newChecked) => {
                                                        const next = new Set(selectedProducts);
                                                        if (newChecked) next.add(p.id);
                                                        else next.delete(p.id);
                                                        setSelectedProducts(next);
                                                    }}
                                                    label={`Select ${p.title}`}
                                                    labelHidden
                                                />
                                            </s-table-cell>
                                            <s-table-cell>
                                                <s-stack direction="inline" align="center" gap="base">
                                                    {p.featuredImage ? (
                                                        <img src={p.featuredImage.url} style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover' }} />
                                                    ) : (
                                                        <div style={{ width: 40, height: 40, background: '#eee', borderRadius: 4 }} />
                                                    )}
                                                    <s-text fontWeight="semibold">{p.title}</s-text>
                                                </s-stack>
                                            </s-table-cell>
                                            <s-table-cell>
                                                <s-badge tone={p.isEnabled ? (p.missingImage ? "attention" : "success") : "subdued"}>
                                                    {p.isEnabled ? (p.missingImage ? "Pending Selection" : "Active") : "Inactive"}
                                                </s-badge>
                                            </s-table-cell>
                                            <s-table-cell>
                                                {p.isEnabled ? (
                                                    p.selectedImageUrl ? (
                                                        <s-stack direction="inline" align="center" gap="tight">
                                                            <img
                                                                src={p.selectedImageUrl}
                                                                style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover', cursor: 'pointer', border: '1px solid #ccc' }}
                                                                onClick={() => handleImageSelect(p)}
                                                                title="Click to change VTO image"
                                                            />
                                                        </s-stack>
                                                    ) : (
                                                        <s-button
                                                            variant="plain"
                                                            onClick={() => handleImageSelect(p)}
                                                        >
                                                            <s-badge tone="attention">⚠️ Select Image</s-badge>
                                                        </s-button>
                                                    )
                                                ) : (
                                                    <s-text tone="subdued">-</s-text>
                                                )}
                                            </s-table-cell>
                                            <s-table-cell>
                                                {p.isEnabled ? (
                                                    <s-button
                                                        tone="critical"
                                                        variant="plain"
                                                        disabled={isLoading}
                                                        onClick={() => handleProductToggle(p, "disable_product")}
                                                    >
                                                        Remove
                                                    </s-button>
                                                ) : (
                                                    <s-button
                                                        tone="success"
                                                        variant="plain"
                                                        disabled={isLoading}
                                                        onClick={() => handleProductToggle(p, "enable_product")}
                                                    >
                                                        Enable Try-On
                                                    </s-button>
                                                )}
                                            </s-table-cell>
                                        </s-table-row>
                                    ))}
                                </s-table-body>
                            </s-table>
                        </s-box>

                        {/* Pagination */}
                        {pageInfo.hasNextPage && (
                            <s-stack justify="center">
                                <s-button onClick={handleNextPage} disabled={isLoading}>Load more</s-button>
                            </s-stack>
                        )}
                    </s-stack>
                </s-section>
            )}
        </s-page>
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
    const error = useRouteError();
    console.error("Products page error:", error);

    return (
        <s-page heading="Manage Products & Collections">
            <s-section>
                <s-banner tone="critical">
                    <s-stack direction="block" gap="tight">
                        <s-text fontWeight="semibold">Failed to load products</s-text>
                        <s-paragraph>
                            Please try refreshing. Error: {error?.message || "Unknown error"}
                        </s-paragraph>
                    </s-stack>
                </s-banner>
            </s-section>
        </s-page>
    );
}
