import { useState, useCallback } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData, redirect, useRouteError, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
    getEnabledProducts,
    getProductsNeedingImageSelection,
    updateProductImage,
    getProductConfig,
} from "../models/productVtoConfig.server";
import {
    Card, BlockStack, InlineStack, Text, Badge, Button,
    Banner, Box, List, Divider
} from "@shopify/polaris";

// GraphQL query to fetch product images
const PRODUCT_IMAGES_QUERY = `
  query getProductImages($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      featuredImage {
        id
        url(transform: { maxWidth: 400, maxHeight: 400 })
      }
      images(first: 50) {
        edges {
          node {
            id
            url(transform: { maxWidth: 400, maxHeight: 400 })
            altText
            width
            height
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

    const enabledProducts = await getEnabledProducts(shop);

    if (enabledProducts.length === 0) {
        const searchParams = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";
        return redirect(`/app/onboarding/products${searchParams}`);
    }

    const needsImages = await getProductsNeedingImageSelection(shop);

    let currentProductId = url.searchParams.get("product");

    if (!currentProductId && needsImages.length > 0) {
        currentProductId = needsImages[0].productId;
    } else if (!currentProductId) {
        currentProductId = enabledProducts[0].productId;
    }

    const currentConfig = await getProductConfig(shop, currentProductId);

    if (!currentConfig) {
        currentProductId = enabledProducts[0].productId;
    }

    const response = await admin.graphql(PRODUCT_IMAGES_QUERY, {
        variables: { id: currentProductId },
    });

    const data = await response.json();
    const productData = data.data?.product;

    const images = productData?.images?.edges?.map(({ node }) => ({
        id: node.id,
        url: node.url,
        altText: node.altText || "Product image",
        width: node.width,
        height: node.height,
    })) || [];

    const currentSelection = currentConfig?.selectedImageId || null;

    return {
        shop,
        enabledProducts,
        needsImages,
        currentProduct: {
            id: currentProductId,
            title: productData?.title || currentConfig?.productTitle,
            handle: productData?.handle,
            images,
            selectedImageId: currentSelection,
        },
        allImagesSelected: needsImages.length === 0,
        progress: {
            completed: enabledProducts.length - needsImages.length,
            total: enabledProducts.length,
        },
    };
};

export const action = async ({ request }) => {
    const { session } = await authenticate.admin(request);
    const shop = session.shop;
    const formData = await request.formData();
    const intent = formData.get("intent");

    try {
        if (intent === "selectImage") {
            const productId = formData.get("productId");
            const imageId = formData.get("imageId");
            const imageUrl = formData.get("imageUrl");

            if (!productId || !imageId || !imageUrl) {
                return { error: "Missing required fields. Please select an image." };
            }

            await updateProductImage(shop, productId, imageId, imageUrl);

            const needsImages = await getProductsNeedingImageSelection(shop);

            if (needsImages.length > 0) {
                const url = new URL(request.url);
                const searchParams = url.searchParams;
                searchParams.set("product", needsImages[0].productId);
                return redirect(`/app/onboarding/images?${searchParams.toString()}`);
            }

            return { success: true, message: "Image selected successfully!" };
        }

        return { error: "Unknown action." };
    } catch (error) {
        console.error("Image selection action error:", error);
        return { error: "An error occurred. Please try again." };
    }
};

export default function ImageSelection() {
    const {
        enabledProducts,
        needsImages,
        currentProduct,
        allImagesSelected,
        progress
    } = useLoaderData();
    const actionData = useActionData();
    const submit = useSubmit();
    const navigation = useNavigation();
    const navigate = useNavigate();

    const [selectedImage, setSelectedImage] = useState(currentProduct.selectedImageId);

    const isLoading = navigation.state !== "idle";

    const handleSaveSelection = useCallback(() => {
        if (!selectedImage) return;
        const selectedImageData = currentProduct.images.find(img => img.id === selectedImage);
        if (!selectedImageData) return;

        const formData = new FormData();
        formData.set("intent", "selectImage");
        formData.set("productId", currentProduct.id);
        formData.set("imageId", selectedImage);
        formData.set("imageUrl", selectedImageData.url);
        submit(formData, { method: "post" });
    }, [selectedImage, currentProduct, submit]);

    const handleProductChange = useCallback((productId) => {
        submit({ product: productId }, { method: "get" });
    }, [submit]);

    return (
        <BlockStack gap="500">
            {/* Feedback banners */}
            {actionData?.error && (
                <Banner tone="critical">
                    <Text as="p">{actionData.error}</Text>
                </Banner>
            )}
            {actionData?.success && (
                <Banner tone="success">
                    <Text as="p">{actionData.message}</Text>
                </Banner>
            )}

            {/* Instructions */}
            <Banner tone="info">
                <BlockStack gap="200">
                    <Text as="p" fontWeight="bold">Step 2: Select VTO-Compatible Images</Text>
                    <Text as="p">For the best Virtual Try-On results, select images that are:</Text>
                    <List type="bullet">
                        <List.Item><Text as="span" fontWeight="bold">Front-facing</Text> — Shows the garment from the front</List.Item>
                        <List.Item><Text as="span" fontWeight="bold">Full garment visible</Text> — No cropping of the product</List.Item>
                        <List.Item><Text as="span" fontWeight="bold">Flat lay or mannequin</Text> — Clean background preferred</List.Item>
                    </List>
                </BlockStack>
            </Banner>

            {/* Progress */}
            <InlineStack gap="300" blockAlign="center">
                <Badge tone={allImagesSelected ? "success" : "attention"}>
                    {progress.completed}/{progress.total} products configured
                </Badge>
                {needsImages.length > 0 && (
                    <Text tone="caution" as="p">{needsImages.length} product(s) still need image selection</Text>
                )}
            </InlineStack>

            {/* Product selector tabs */}
            <Card padding="400">
                <BlockStack gap="300">
                    <Text fontWeight="semibold" as="p">Select product to configure:</Text>
                    <InlineStack gap="200" wrap>
                        {enabledProducts.map((product) => {
                            const isNeedsImage = needsImages.some(p => p.productId === product.productId);
                            const isCurrent = product.productId === currentProduct.id;
                            const label = product.productTitle.length > 25
                                ? product.productTitle.substring(0, 25) + "..."
                                : product.productTitle;

                            return (
                                <Button
                                    key={product.productId}
                                    variant={isCurrent ? "primary" : "secondary"}
                                    onClick={() => handleProductChange(product.productId)}
                                    disabled={isLoading}
                                    size="slim"
                                >
                                    {label}{isNeedsImage && !isCurrent ? " ⚠️" : ""}{!isNeedsImage && !isCurrent ? " ✓" : ""}
                                </Button>
                            );
                        })}
                    </InlineStack>
                </BlockStack>
            </Card>

            {/* Current product images */}
            <Card padding="500">
                <BlockStack gap="400">
                    <InlineStack gap="300" blockAlign="center" align="space-between">
                        <Text variant="headingMd" as="h2">{currentProduct.title}</Text>
                        {currentProduct.selectedImageId && selectedImage === currentProduct.selectedImageId && (
                            <Badge tone="success">Image selected</Badge>
                        )}
                    </InlineStack>

                    {currentProduct.images.length === 0 ? (
                        <Banner tone="warning">
                            <Text as="p">This product has no images. Please add images in Shopify Admin first.</Text>
                        </Banner>
                    ) : (
                        <BlockStack gap="400">
                            <Text tone="subdued" as="p">
                                Click an image to select it for Virtual Try-On ({currentProduct.images.length} image{currentProduct.images.length !== 1 ? "s" : ""} available)
                            </Text>

                            {/* Image grid */}
                            <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                                gap: "16px",
                            }}>
                                {currentProduct.images.map((image) => {
                                    const isSelected = selectedImage === image.id;
                                    return (
                                        <div
                                            key={image.id}
                                            onClick={() => setSelectedImage(image.id)}
                                            style={{
                                                position: "relative",
                                                cursor: "pointer",
                                                border: isSelected
                                                    ? "3px solid var(--p-color-border-success)"
                                                    : "2px solid var(--p-color-border)",
                                                borderRadius: "8px",
                                                overflow: "hidden",
                                                backgroundColor: "var(--p-color-bg-surface)",
                                                transition: "border-color 0.15s ease, transform 0.15s ease",
                                                transform: isSelected ? "scale(1.02)" : "scale(1)",
                                            }}
                                        >
                                            <img
                                                src={image.url}
                                                alt={image.altText}
                                                style={{ width: "100%", height: "200px", objectFit: "cover", display: "block" }}
                                            />
                                            {isSelected && (
                                                <div style={{
                                                    position: "absolute", top: "8px", right: "8px",
                                                    backgroundColor: "var(--p-color-bg-fill-success)",
                                                    color: "white", borderRadius: "50%",
                                                    width: "24px", height: "24px",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: "14px", fontWeight: "bold",
                                                }}>✓</div>
                                            )}
                                            <div style={{ padding: "8px", backgroundColor: "var(--p-color-bg-surface-secondary)" }}>
                                                <Text variant="bodySm" tone="subdued" as="p">
                                                    {image.width && image.height
                                                        ? `${image.width} × ${image.height}px`
                                                        : "Product image"}
                                                </Text>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {!selectedImage && (
                                <Banner tone="warning">
                                    <Text as="p">Please select an image before continuing.</Text>
                                </Banner>
                            )}

                            <InlineStack gap="300" blockAlign="center">
                                <Button
                                    variant="primary"
                                    onClick={handleSaveSelection}
                                    disabled={!selectedImage || isLoading}
                                    loading={isLoading}
                                >
                                    Save Image Selection
                                </Button>
                                {selectedImage && selectedImage !== currentProduct.selectedImageId && (
                                    <Text tone="subdued" as="p">Unsaved changes</Text>
                                )}
                            </InlineStack>
                        </BlockStack>
                    )}
                </BlockStack>
            </Card>

            <Divider />

            {/* Navigation */}
            <InlineStack gap="300" blockAlign="center">
                <Button onClick={() => navigate("/app/onboarding/products")}>← Back to Products</Button>
                <Button
                    variant="primary"
                    disabled={!allImagesSelected}
                    onClick={() => navigate("/app/onboarding/complete")}
                >
                    Complete Setup →
                </Button>
                {!allImagesSelected && (
                    <Text tone="subdued" as="p">Select images for all products to continue</Text>
                )}
            </InlineStack>
        </BlockStack>
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
    const error = useRouteError();
    console.error("Images page error:", error);

    return (
        <Banner tone="critical" title="Failed to load images">
            <Text as="p">Please try refreshing. Error: {error?.message || "Unknown error"}</Text>
        </Banner>
    );
}
