import { useState, useCallback } from "react";
import { useLoaderData, useSubmit, useNavigation, useActionData, redirect, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
    getEnabledProducts,
    getProductsNeedingImageSelection,
    updateProductImage,
    getProductConfig,
} from "../models/productVtoConfig.server";

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

    // Get enabled products
    const enabledProducts = await getEnabledProducts(shop);

    if (enabledProducts.length === 0) {
        // No products to configure, go back to product selection
        return redirect("/app/onboarding/products");
    }

    // Get products needing image selection
    const needsImages = await getProductsNeedingImageSelection(shop);

    // Get current product ID from URL or default to first needing images
    let currentProductId = url.searchParams.get("product");

    if (!currentProductId && needsImages.length > 0) {
        currentProductId = needsImages[0].productId;
    } else if (!currentProductId) {
        currentProductId = enabledProducts[0].productId;
    }

    // Verify product is in our enabled list
    const currentConfig = await getProductConfig(shop, currentProductId);

    if (!currentConfig) {
        currentProductId = enabledProducts[0].productId;
    }

    // Fetch images for current product from Shopify
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

    // Get current selection for this product
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

            // Check if there are more products needing images
            const needsImages = await getProductsNeedingImageSelection(shop);

            if (needsImages.length > 0) {
                // Navigate to next product needing an image
                return redirect(`/app/onboarding/images?product=${encodeURIComponent(needsImages[0].productId)}`);
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

    const [selectedImage, setSelectedImage] = useState(currentProduct.selectedImageId);

    const isLoading = navigation.state !== "idle";

    // Handle image selection and save
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

    // Navigate to different product
    const handleProductChange = useCallback((productId) => {
        submit({ product: productId }, { method: "get" });
    }, [submit]);

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
                    <s-stack direction="block" gap="tight">
                        <s-text fontWeight="semibold">Step 2: Select VTO-Compatible Images</s-text>
                        <s-text>
                            For the best Virtual Try-On results, select images that are:
                        </s-text>
                        <s-unordered-list>
                            <s-list-item><strong>Front-facing</strong> — Shows the garment from the front</s-list-item>
                            <s-list-item><strong>Full garment visible</strong> — No cropping of the product</s-list-item>
                            <s-list-item><strong>Flat lay or mannequin</strong> — Clean background preferred</s-list-item>
                        </s-unordered-list>
                    </s-stack>
                </s-banner>
            </s-section>

            {/* Progress */}
            <s-section>
                <s-stack direction="inline" gap="loose">
                    <s-badge tone={allImagesSelected ? "success" : "attention"}>
                        {progress.completed}/{progress.total} products configured
                    </s-badge>
                    {needsImages.length > 0 && (
                        <s-text tone="caution">
                            {needsImages.length} product(s) still need image selection
                        </s-text>
                    )}
                </s-stack>
            </s-section>

            {/* Product selector */}
            <s-section>
                <s-stack direction="block" gap="base">
                    <s-text fontWeight="semibold">Select product to configure:</s-text>
                    <s-stack direction="inline" gap="tight" wrap>
                        {enabledProducts.map((product) => {
                            const isNeedsImage = needsImages.some(p => p.productId === product.productId);
                            const isCurrent = product.productId === currentProduct.id;

                            return (
                                <s-button
                                    key={product.productId}
                                    variant={isCurrent ? "primary" : "tertiary"}
                                    onClick={() => handleProductChange(product.productId)}
                                    disabled={isLoading}
                                >
                                    {product.productTitle.substring(0, 25)}
                                    {product.productTitle.length > 25 ? "..." : ""}
                                    {isNeedsImage && !isCurrent && " ⚠️"}
                                    {!isNeedsImage && !isCurrent && " ✓"}
                                </s-button>
                            );
                        })}
                    </s-stack>
                </s-stack>
            </s-section>

            {/* Current product images */}
            <s-section>
                <s-box borderWidth="base" borderRadius="base" padding="base">
                    <s-stack direction="block" gap="base">
                        <s-stack direction="inline" gap="base" align="center">
                            <s-heading>{currentProduct.title}</s-heading>
                            {currentProduct.selectedImageId && selectedImage === currentProduct.selectedImageId && (
                                <s-badge tone="success">Image selected</s-badge>
                            )}
                        </s-stack>

                        {currentProduct.images.length === 0 ? (
                            <s-banner tone="warning">
                                <s-paragraph>
                                    This product has no images. Please add images in Shopify Admin first.
                                </s-paragraph>
                            </s-banner>
                        ) : (
                            <>
                                <s-text tone="subdued">
                                    Click an image to select it for Virtual Try-On ({currentProduct.images.length} image{currentProduct.images.length !== 1 ? "s" : ""} available)
                                </s-text>

                                {/* Image grid */}
                                <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                                    gap: "16px",
                                    marginTop: "16px"
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
                                                    style={{
                                                        width: "100%",
                                                        height: "200px",
                                                        objectFit: "cover",
                                                        display: "block",
                                                    }}
                                                />
                                                {isSelected && (
                                                    <div style={{
                                                        position: "absolute",
                                                        top: "8px",
                                                        right: "8px",
                                                        backgroundColor: "var(--p-color-bg-fill-success)",
                                                        color: "white",
                                                        borderRadius: "50%",
                                                        width: "24px",
                                                        height: "24px",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        fontSize: "14px",
                                                        fontWeight: "bold",
                                                    }}>
                                                        ✓
                                                    </div>
                                                )}
                                                <div style={{
                                                    padding: "8px",
                                                    backgroundColor: "var(--p-color-bg-surface-secondary)",
                                                }}>
                                                    <s-text variant="bodySm" tone="subdued">
                                                        {image.width && image.height
                                                            ? `${image.width} × ${image.height}px`
                                                            : "Product image"
                                                        }
                                                    </s-text>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Validation message */}
                                {!selectedImage && (
                                    <s-banner tone="warning">
                                        <s-paragraph>
                                            Please select an image before continuing. This product cannot be used for Try-On without an image.
                                        </s-paragraph>
                                    </s-banner>
                                )}

                                {/* Save button */}
                                <s-stack direction="inline" gap="base">
                                    <s-button
                                        variant="primary"
                                        onClick={handleSaveSelection}
                                        disabled={!selectedImage || isLoading}
                                    >
                                        {isLoading ? "Saving..." : "Save Image Selection"}
                                    </s-button>

                                    {selectedImage && selectedImage !== currentProduct.selectedImageId && (
                                        <s-text tone="subdued">Unsaved changes</s-text>
                                    )}
                                </s-stack>
                            </>
                        )}
                    </s-stack>
                </s-box>
            </s-section>

            {/* Navigation */}
            <s-section>
                <s-stack direction="inline" gap="base">
                    <s-link href="/app/onboarding/products">
                        <s-button>← Back to Products</s-button>
                    </s-link>

                    <s-link href="/app/onboarding/complete">
                        <s-button
                            variant="primary"
                            disabled={!allImagesSelected}
                        >
                            Complete Setup →
                        </s-button>
                    </s-link>

                    {!allImagesSelected && (
                        <s-text tone="subdued">
                            Select images for all products to continue
                        </s-text>
                    )}
                </s-stack>
            </s-section>
        </>
    );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

export function ErrorBoundary() {
    const error = useRouteError();
    console.error("Images page error:", error);

    return (
        <>
            <s-section>
                <s-banner tone="critical">
                    <s-stack direction="block" gap="tight">
                        <s-text fontWeight="semibold">Failed to load images</s-text>
                        <s-paragraph>
                            Please try refreshing. Error: {error?.message || "Unknown error"}
                        </s-paragraph>
                    </s-stack>
                </s-banner>
            </s-section>
        </>
    );
}
