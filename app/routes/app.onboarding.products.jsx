import { useState, useCallback, useEffect } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
    getAllProductConfigs,
    bulkEnableProducts,
    bulkDisableProducts,
    deleteProductConfigs
} from "../models/productVtoConfig.server";

// GraphQL query to fetch products with pagination and search
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
        cursor
        node {
          id
          title
          handle
          status
          featuredImage {
            id
            url(transform: { maxWidth: 100, maxHeight: 100 })
            altText
          }
          images(first: 1) {
            edges {
              node {
                id
                url(transform: { maxWidth: 100, maxHeight: 100 })
              }
            }
          }
          totalInventory
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const PRODUCTS_QUERY_BACKWARD = `
  query getProductsBefore($last: Int!, $before: String, $query: String) {
    products(last: $last, before: $before, query: $query) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      edges {
        cursor
        node {
          id
          title
          handle
          status
          featuredImage {
            id
            url(transform: { maxWidth: 100, maxHeight: 100 })
            altText
          }
          images(first: 1) {
            edges {
              node {
                id
                url(transform: { maxWidth: 100, maxHeight: 100 })
              }
            }
          }
          totalInventory
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

export const loader = async ({ request }) => {
    const { session, admin } = await authenticate.admin(request);
    const shop = session.shop;
    const url = new URL(request.url);

    const searchQuery = url.searchParams.get("q") || "";
    const after = url.searchParams.get("after") || null;
    const before = url.searchParams.get("before") || null;
    const pageSize = 25;

    // Build Shopify search query
    let shopifyQuery = searchQuery ? `title:*${searchQuery}*` : null;

    // Determine direction and fetch products from Shopify
    let response;
    if (before) {
        // Backward pagination
        response = await admin.graphql(PRODUCTS_QUERY_BACKWARD, {
            variables: {
                last: pageSize,
                before,
                query: shopifyQuery,
            },
        });
    } else {
        // Forward pagination (default)
        response = await admin.graphql(PRODUCTS_QUERY_FORWARD, {
            variables: {
                first: pageSize,
                after,
                query: shopifyQuery,
            },
        });
    }

    const data = await response.json();
    const products = data.data?.products?.edges || [];
    const pageInfo = data.data?.products?.pageInfo || {};

    // Get existing configurations from our database
    const existingConfigs = await getAllProductConfigs(shop);
    const configMap = new Map(existingConfigs.map(c => [c.productId, c]));

    // Merge Shopify products with our config data
    const productsWithConfig = products.map(({ node, cursor }) => ({
        id: node.id,
        cursor,
        title: node.title,
        handle: node.handle,
        status: node.status,
        image: node.featuredImage?.url || node.images?.edges?.[0]?.node?.url || null,
        imageAlt: node.featuredImage?.altText || node.title,
        inventory: node.totalInventory,
        price: node.priceRangeV2?.minVariantPrice,
        // Our config data
        isEnabled: configMap.get(node.id)?.isEnabled ?? false,
        hasImageSelected: configMap.get(node.id)?.selectedImageId ? true : false,
    }));

    return {
        shop,
        products: productsWithConfig,
        pageInfo,
        searchQuery,
        enabledCount: existingConfigs.filter(c => c.isEnabled).length,
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    try {
        if (intent === "enable") {
            // Enable selected products
            const productsJson = formData.get("products");
            const products = JSON.parse(productsJson);

            if (products.length === 0) {
                return { error: "Please select at least one product to enable." };
            }

            await bulkEnableProducts(shop, products.map(p => ({
                productId: p.id,
                productTitle: p.title,
                productImage: p.image,
            })));

            return { success: true, message: `Enabled ${products.length} product(s) for Try-On.` };
        }

        if (intent === "disable") {
            const productIds = JSON.parse(formData.get("productIds"));
            await bulkDisableProducts(shop, productIds);
            return { success: true, message: `Disabled ${productIds.length} product(s).` };
        }

        if (intent === "remove") {
            const productIds = JSON.parse(formData.get("productIds"));
            await deleteProductConfigs(shop, productIds);
            return { success: true, message: `Removed ${productIds.length} product(s) from Try-On.` };
        }

        return { error: "Unknown action." };
    } catch (error) {
        console.error("Product selection action error:", error);
        return { error: "An error occurred. Please try again." };
    }
};

export default function ProductSelection() {
    const { products, pageInfo, searchQuery, enabledCount } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();

    const [selectedProducts, setSelectedProducts] = useState([]);
    const [localSearch, setLocalSearch] = useState(searchQuery || "");

    const isLoading = navigation.state !== "idle";

    // Clear selection when products change
    useEffect(() => {
        setSelectedProducts([]);
    }, [products]);

    // Handle search
    const handleSearch = useCallback(() => {
        const formData = new FormData();
        submit({ q: localSearch }, { method: "get" });
    }, [localSearch, submit]);

    // Handle search on Enter key
    const handleSearchKeyDown = useCallback((e) => {
        if (e.key === "Enter") {
            handleSearch();
        }
    }, [handleSearch]);

    // Clear search
    const handleClearSearch = useCallback(() => {
        setLocalSearch("");
        submit({}, { method: "get" });
    }, [submit]);

    // Toggle product selection
    const toggleProduct = useCallback((productId) => {
        setSelectedProducts(prev => {
            if (prev.includes(productId)) {
                return prev.filter(id => id !== productId);
            }
            return [...prev, productId];
        });
    }, []);

    // Select all
    const selectAll = useCallback(() => {
        setSelectedProducts(products.map(p => p.id));
    }, [products]);

    // Deselect all
    const deselectAll = useCallback(() => {
        setSelectedProducts([]);
    }, []);

    // Enable selected products
    const handleEnable = useCallback(() => {
        const selectedData = products.filter(p => selectedProducts.includes(p.id));
        const formData = new FormData();
        formData.set("intent", "enable");
        formData.set("products", JSON.stringify(selectedData));
        submit(formData, { method: "post" });
    }, [products, selectedProducts, submit]);

    // Disable selected products
    const handleDisable = useCallback(() => {
        const formData = new FormData();
        formData.set("intent", "disable");
        formData.set("productIds", JSON.stringify(selectedProducts));
        submit(formData, { method: "post" });
    }, [selectedProducts, submit]);

    // Navigate to next/previous page
    const handleNextPage = useCallback(() => {
        if (pageInfo.hasNextPage) {
            submit({ q: searchQuery || "", after: pageInfo.endCursor }, { method: "get" });
        }
    }, [pageInfo, searchQuery, submit]);

    const handlePrevPage = useCallback(() => {
        if (pageInfo.hasPreviousPage && pageInfo.startCursor) {
            submit({ q: searchQuery || "", before: pageInfo.startCursor }, { method: "get" });
        }
    }, [pageInfo, searchQuery, submit]);

    const selectedCount = selectedProducts.length;
    const allSelected = products.length > 0 && selectedCount === products.length;
    const someSelected = selectedCount > 0 && !allSelected;

    // Get selected products that are currently enabled
    const selectedEnabled = products.filter(
        p => selectedProducts.includes(p.id) && p.isEnabled
    ).length;
    const selectedDisabled = selectedCount - selectedEnabled;

    return (
        <>
            {/* Action feedback */}
            {actionData?.error && (
                <s-section>
                    <s-banner tone="critical" dismissible>
                        <s-paragraph>{actionData.error}</s-paragraph>
                    </s-banner>
                </s-section>
            )}

            {actionData?.success && (
                <s-section>
                    <s-banner tone="success" dismissible>
                        <s-paragraph>{actionData.message}</s-paragraph>
                    </s-banner>
                </s-section>
            )}

            {/* Instructions */}
            <s-section>
                <s-banner tone="info">
                    <s-paragraph>
                        <strong>Step 1: Select Products</strong> — Choose which products should display the "Try On" button.
                        Customers will only see the button on enabled products.
                    </s-paragraph>
                </s-banner>
            </s-section>

            {/* Stats */}
            <s-section>
                <s-stack direction="inline" gap="loose">
                    <s-badge tone="info">{products.length} products shown</s-badge>
                    <s-badge tone="success">{enabledCount} enabled for Try-On</s-badge>
                    {selectedCount > 0 && (
                        <s-badge tone="attention">{selectedCount} selected</s-badge>
                    )}
                </s-stack>
            </s-section>

            {/* Search and Actions */}
            <s-section>
                <s-stack direction="block" gap="base">
                    <s-stack direction="inline" gap="base" align="center">
                        <s-text-field
                            label="Search products"
                            labelHidden
                            placeholder="Search by product title..."
                            value={localSearch}
                            onChange={(e) => setLocalSearch(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                            clearButton
                            onClearButtonClick={handleClearSearch}
                        />
                        <s-button onClick={handleSearch} disabled={isLoading}>
                            Search
                        </s-button>
                        {searchQuery && (
                            <s-button onClick={handleClearSearch} variant="plain">
                                Clear
                            </s-button>
                        )}
                    </s-stack>

                    {/* Bulk actions */}
                    <s-stack direction="inline" gap="base">
                        <s-button
                            onClick={allSelected ? deselectAll : selectAll}
                            variant="plain"
                        >
                            {allSelected ? "Deselect All" : "Select All"}
                        </s-button>

                        {selectedCount > 0 && (
                            <>
                                <s-button
                                    onClick={handleEnable}
                                    variant="primary"
                                    disabled={isLoading}
                                >
                                    Enable Try-On ({selectedCount})
                                </s-button>

                                {selectedEnabled > 0 && (
                                    <s-button
                                        onClick={handleDisable}
                                        disabled={isLoading}
                                    >
                                        Disable ({selectedEnabled})
                                    </s-button>
                                )}
                            </>
                        )}
                    </s-stack>
                </s-stack>
            </s-section>

            {/* Products Table */}
            <s-section>
                {isLoading ? (
                    <s-box padding="loose">
                        <s-spinner />
                        <s-text>Loading products...</s-text>
                    </s-box>
                ) : products.length === 0 ? (
                    <s-box padding="loose" borderWidth="base" borderRadius="base">
                        <s-stack direction="block" gap="base" align="center">
                            <s-text tone="subdued">
                                {searchQuery
                                    ? `No products found matching "${searchQuery}"`
                                    : "No products found in your store"
                                }
                            </s-text>
                            {searchQuery && (
                                <s-button onClick={handleClearSearch}>Clear search</s-button>
                            )}
                        </s-stack>
                    </s-box>
                ) : (
                    <s-box borderWidth="base" borderRadius="base" overflow="hidden">
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--p-color-border)" }}>
                                    <th style={{ padding: "12px 16px", textAlign: "left", width: "40px" }}>
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            ref={(el) => {
                                                if (el) el.indeterminate = someSelected;
                                            }}
                                            onChange={(e) => {
                                                if (e.target.checked) selectAll();
                                                else deselectAll();
                                            }}
                                        />
                                    </th>
                                    <th style={{ padding: "12px 16px", textAlign: "left", width: "60px" }}>Image</th>
                                    <th style={{ padding: "12px 16px", textAlign: "left" }}>Product</th>
                                    <th style={{ padding: "12px 16px", textAlign: "left", width: "100px" }}>Status</th>
                                    <th style={{ padding: "12px 16px", textAlign: "left", width: "120px" }}>Try-On</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product) => (
                                    <tr
                                        key={product.id}
                                        style={{
                                            borderBottom: "1px solid var(--p-color-border)",
                                            backgroundColor: selectedProducts.includes(product.id)
                                                ? "var(--p-color-bg-surface-selected)"
                                                : "transparent"
                                        }}
                                        onClick={() => toggleProduct(product.id)}
                                    >
                                        <td style={{ padding: "12px 16px" }} onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedProducts.includes(product.id)}
                                                onChange={() => toggleProduct(product.id)}
                                            />
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            {product.image ? (
                                                <img
                                                    src={product.image}
                                                    alt={product.imageAlt}
                                                    style={{
                                                        width: "40px",
                                                        height: "40px",
                                                        objectFit: "cover",
                                                        borderRadius: "4px"
                                                    }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: "40px",
                                                    height: "40px",
                                                    backgroundColor: "var(--p-color-bg-surface-secondary)",
                                                    borderRadius: "4px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center"
                                                }}>
                                                    <s-text tone="subdued">—</s-text>
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <s-stack direction="block" gap="none">
                                                <s-text fontWeight="semibold">{product.title}</s-text>
                                                <s-text tone="subdued" variant="bodySm">
                                                    {product.handle}
                                                </s-text>
                                            </s-stack>
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <s-badge tone={product.status === "ACTIVE" ? "success" : "subdued"}>
                                                {product.status}
                                            </s-badge>
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            {product.isEnabled ? (
                                                <s-stack direction="block" gap="none">
                                                    <s-badge tone="success">Enabled</s-badge>
                                                    {product.hasImageSelected ? (
                                                        <s-text tone="success" variant="bodySm">Image set</s-text>
                                                    ) : (
                                                        <s-text tone="caution" variant="bodySm">Needs image</s-text>
                                                    )}
                                                </s-stack>
                                            ) : (
                                                <s-badge tone="subdued">Disabled</s-badge>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </s-box>
                )}
            </s-section>

            {/* Pagination */}
            {(pageInfo.hasNextPage || pageInfo.hasPreviousPage) && (
                <s-section>
                    <s-stack direction="inline" gap="base" align="center">
                        <s-button
                            onClick={handlePrevPage}
                            disabled={!pageInfo.hasPreviousPage || isLoading}
                        >
                            Previous
                        </s-button>
                        <s-button
                            onClick={handleNextPage}
                            disabled={!pageInfo.hasNextPage || isLoading}
                        >
                            Next
                        </s-button>
                    </s-stack>
                </s-section>
            )}

            {/* Navigation */}
            <s-section>
                <s-stack direction="inline" gap="base">
                    <s-link href="/app/onboarding/customize">
                        <s-button>← Back to Customize</s-button>
                    </s-link>
                    <s-link href="/app/onboarding/images">
                        <s-button
                            variant="primary"
                            disabled={enabledCount === 0}
                        >
                            Next: Choose Images →
                        </s-button>
                    </s-link>
                    {enabledCount === 0 && (
                        <s-text tone="subdued">Enable at least one product to continue</s-text>
                    )}
                </s-stack>
            </s-section>
        </>
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
    const error = useRouteError();
    console.error("Products page error:", error);

    return (
        <>
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
        </>
    );
}
