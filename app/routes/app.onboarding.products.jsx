import { useState, useCallback, useEffect } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData, useRouteError, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
    getAllProductConfigs,
    bulkEnableProducts,
    bulkDisableProducts,
    deleteProductConfigs
} from "../models/productVtoConfig.server";
import {
    Card, BlockStack, InlineStack, Text, Badge, Button,
    Banner, Box, TextField, Spinner, Divider, InlineGrid
} from "@shopify/polaris";

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

    let shopifyQuery = searchQuery ? `title:*${searchQuery}*` : null;

    let response;
    if (before) {
        response = await admin.graphql(PRODUCTS_QUERY_BACKWARD, {
            variables: { last: pageSize, before, query: shopifyQuery },
        });
    } else {
        response = await admin.graphql(PRODUCTS_QUERY_FORWARD, {
            variables: { first: pageSize, after, query: shopifyQuery },
        });
    }

    const data = await response.json();
    const products = data.data?.products?.edges || [];
    const pageInfo = data.data?.products?.pageInfo || {};

    const existingConfigs = await getAllProductConfigs(shop);
    const configMap = new Map(existingConfigs.map(c => [c.productId, c]));

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
    const navigate = useNavigate();

    const [selectedProducts, setSelectedProducts] = useState([]);
    const [localSearch, setLocalSearch] = useState(searchQuery || "");

    const isLoading = navigation.state !== "idle";

    useEffect(() => { setSelectedProducts([]); }, [products]);

    const handleSearch = useCallback(() => {
        submit({ q: localSearch }, { method: "get" });
    }, [localSearch, submit]);

    const handleClearSearch = useCallback(() => {
        setLocalSearch("");
        submit({}, { method: "get" });
    }, [submit]);

    const toggleProduct = useCallback((productId) => {
        setSelectedProducts(prev =>
            prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
        );
    }, []);

    const selectAll = useCallback(() => setSelectedProducts(products.map(p => p.id)), [products]);
    const deselectAll = useCallback(() => setSelectedProducts([]), []);

    const handleEnable = useCallback(() => {
        const selectedData = products.filter(p => selectedProducts.includes(p.id));
        const formData = new FormData();
        formData.set("intent", "enable");
        formData.set("products", JSON.stringify(selectedData));
        submit(formData, { method: "post" });
    }, [products, selectedProducts, submit]);

    const handleDisable = useCallback(() => {
        const formData = new FormData();
        formData.set("intent", "disable");
        formData.set("productIds", JSON.stringify(selectedProducts));
        submit(formData, { method: "post" });
    }, [selectedProducts, submit]);

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
    const selectedEnabled = products.filter(p => selectedProducts.includes(p.id) && p.isEnabled).length;

    return (
        <BlockStack gap="500">
            {/* Feedback banners */}
            {actionData?.error && (
                <Banner tone="critical" onDismiss={() => { }}>
                    <Text as="p">{actionData.error}</Text>
                </Banner>
            )}
            {actionData?.success && (
                <Banner tone="success" onDismiss={() => { }}>
                    <Text as="p">{actionData.message}</Text>
                </Banner>
            )}

            {/* Instructions */}
            <Banner tone="info">
                <Text as="p">
                    <Text as="span" fontWeight="bold">Step 1: Select Products</Text> — Choose which products should
                    display the "Try On" button. Customers will only see the button on enabled products.
                </Text>
            </Banner>

            {/* Stats */}
            <InlineStack gap="300">
                <Badge tone="info">{products.length} products shown</Badge>
                <Badge tone="success">{enabledCount} enabled for Try-On</Badge>
                {selectedCount > 0 && <Badge tone="attention">{selectedCount} selected</Badge>}
            </InlineStack>

            {/* Search + Bulk Actions */}
            <Card padding="400">
                <BlockStack gap="300">
                    <InlineStack gap="300" blockAlign="end">
                        <Box style={{ flex: 1 }}>
                            <TextField
                                label="Search products"
                                labelHidden
                                placeholder="Search by product title..."
                                value={localSearch}
                                onChange={setLocalSearch}
                                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                                clearButton
                                onClearButtonClick={handleClearSearch}
                                autoComplete="off"
                            />
                        </Box>
                        <Button onClick={handleSearch} disabled={isLoading}>Search</Button>
                        {searchQuery && (
                            <Button onClick={handleClearSearch} variant="plain">Clear</Button>
                        )}
                    </InlineStack>

                    <InlineStack gap="300">
                        <Button onClick={allSelected ? deselectAll : selectAll} variant="plain">
                            {allSelected ? "Deselect All" : "Select All"}
                        </Button>
                        {selectedCount > 0 && (
                            <>
                                <Button onClick={handleEnable} variant="primary" disabled={isLoading}>
                                    Enable Try-On ({selectedCount})
                                </Button>
                                {selectedEnabled > 0 && (
                                    <Button onClick={handleDisable} disabled={isLoading}>
                                        Disable ({selectedEnabled})
                                    </Button>
                                )}
                            </>
                        )}
                    </InlineStack>
                </BlockStack>
            </Card>

            {/* Products Table */}
            <Card padding="0">
                {isLoading ? (
                    <Box padding="600">
                        <InlineStack gap="300" blockAlign="center">
                            <Spinner size="small" />
                            <Text tone="subdued" as="p">Loading products...</Text>
                        </InlineStack>
                    </Box>
                ) : products.length === 0 ? (
                    <Box padding="600">
                        <BlockStack gap="300" inlineAlign="center">
                            <Text tone="subdued" as="p">
                                {searchQuery
                                    ? `No products found matching "${searchQuery}"`
                                    : "No products found in your store"}
                            </Text>
                            {searchQuery && (
                                <Button onClick={handleClearSearch}>Clear search</Button>
                            )}
                        </BlockStack>
                    </Box>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ borderBottom: "1px solid var(--p-color-border)", backgroundColor: "var(--p-color-bg-surface-secondary)" }}>
                                <th style={{ padding: "12px 16px", textAlign: "left", width: "40px" }}>
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                                        onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                                    />
                                </th>
                                <th style={{ padding: "12px 16px", textAlign: "left", width: "60px" }}></th>
                                <th style={{ padding: "12px 16px", textAlign: "left" }}>
                                    <Text variant="bodySm" fontWeight="semibold" as="span">Product</Text>
                                </th>
                                <th style={{ padding: "12px 16px", textAlign: "left", width: "100px" }}>
                                    <Text variant="bodySm" fontWeight="semibold" as="span">Status</Text>
                                </th>
                                <th style={{ padding: "12px 16px", textAlign: "left", width: "130px" }}>
                                    <Text variant="bodySm" fontWeight="semibold" as="span">Try-On</Text>
                                </th>
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
                                            : "transparent",
                                        cursor: "pointer",
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
                                                style={{ width: "44px", height: "44px", objectFit: "cover", borderRadius: "var(--p-border-radius-100)" }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: "44px", height: "44px",
                                                backgroundColor: "var(--p-color-bg-surface-secondary)",
                                                borderRadius: "var(--p-border-radius-100)",
                                                display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                                <Text tone="subdued" as="span">—</Text>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: "12px 16px" }}>
                                        <BlockStack gap="050">
                                            <Text fontWeight="semibold" as="p">{product.title}</Text>
                                            <Text tone="subdued" variant="bodySm" as="p">{product.handle}</Text>
                                        </BlockStack>
                                    </td>
                                    <td style={{ padding: "12px 16px" }}>
                                        <Badge tone={product.status === "ACTIVE" ? "success" : "subdued"}>
                                            {product.status}
                                        </Badge>
                                    </td>
                                    <td style={{ padding: "12px 16px" }}>
                                        {product.isEnabled ? (
                                            <BlockStack gap="100">
                                                <Badge tone="success">Enabled</Badge>
                                                <Text tone={product.hasImageSelected ? "success" : "caution"} variant="bodySm" as="p">
                                                    {product.hasImageSelected ? "Image set" : "Needs image"}
                                                </Text>
                                            </BlockStack>
                                        ) : (
                                            <Badge tone="subdued">Disabled</Badge>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Card>

            {/* Pagination */}
            {(pageInfo.hasNextPage || pageInfo.hasPreviousPage) && (
                <InlineStack gap="300">
                    <Button onClick={handlePrevPage} disabled={!pageInfo.hasPreviousPage || isLoading}>
                        ← Previous
                    </Button>
                    <Button onClick={handleNextPage} disabled={!pageInfo.hasNextPage || isLoading}>
                        Next →
                    </Button>
                </InlineStack>
            )}

            <Divider />

            {/* Navigation */}
            <InlineStack gap="300" blockAlign="center">
                <Button onClick={() => navigate("/app/onboarding/customize")}>← Back to Customize</Button>
                <Button
                    variant="primary"
                    disabled={enabledCount === 0}
                    onClick={() => navigate("/app/onboarding/images")}
                >
                    Next: Choose Images →
                </Button>
                {enabledCount === 0 && (
                    <Text tone="subdued" as="p">Enable at least one product to continue</Text>
                )}
            </InlineStack>
        </BlockStack>
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
    const error = useRouteError();
    console.error("Products page error:", error);

    return (
        <Banner tone="critical" title="Failed to load products">
            <Text as="p">Please try refreshing. Error: {error?.message || "Unknown error"}</Text>
        </Banner>
    );
}
