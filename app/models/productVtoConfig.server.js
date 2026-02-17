import prisma from "../db.server";

/**
 * Get all VTO-enabled products for a shop
 */
export async function getEnabledProducts(shop) {
    return prisma.productVtoConfig.findMany({
        where: { shop, isEnabled: true },
        orderBy: { updatedAt: "desc" },
    });
}

/**
 * Get all product VTO configs for a shop (including disabled)
 */
export async function getAllProductConfigs(shop) {
    return prisma.productVtoConfig.findMany({
        where: { shop },
        orderBy: { updatedAt: "desc" },
    });
}

/**
 * Get a single product VTO config
 */
export async function getProductConfig(shop, productId) {
    return prisma.productVtoConfig.findUnique({
        where: {
            shop_productId: { shop, productId },
        },
    });
}

/**
 * Upsert a product VTO configuration
 * Used when enabling a product and selecting its VTO image
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
    return prisma.productVtoConfig.upsert({
        where: {
            shop_productId: { shop, productId },
        },
        create: {
            shop,
            productId,
            productTitle,
            productImage,
            selectedImageId,
            selectedImageUrl,
            isEnabled,
        },
        update: {
            productTitle,
            productImage,
            selectedImageId,
            selectedImageUrl,
            isEnabled,
        },
    });
}

/**
 * Bulk enable products with placeholder image selection
 * Image selection will be completed in step 2
 */
export async function bulkEnableProducts(shop, products) {
    const operations = products.map((product) => {
        return prisma.productVtoConfig.upsert({
            where: {
                shop_productId: { shop, productId: product.productId },
            },
            create: {
                shop,
                productId: product.productId,
                productTitle: product.productTitle,
                productImage: product.productImage,
                // Placeholder values - will be set in image selection step
                selectedImageId: "",
                selectedImageUrl: "",
                isEnabled: true,
            },
            update: {
                productTitle: product.productTitle,
                productImage: product.productImage,
                isEnabled: true,
            },
        });
    });

    return prisma.$transaction(operations);
}

/**
 * Bulk disable products
 */
export async function bulkDisableProducts(shop, productIds) {
    return prisma.productVtoConfig.updateMany({
        where: {
            shop,
            productId: { in: productIds },
        },
        data: { isEnabled: false },
    });
}

/**
 * Delete product configs entirely
 */
export async function deleteProductConfigs(shop, productIds) {
    return prisma.productVtoConfig.deleteMany({
        where: {
            shop,
            productId: { in: productIds },
        },
    });
}

/**
 * Update the selected image for a product
 */
export async function updateProductImage(shop, productId, selectedImageId, selectedImageUrl) {
    return prisma.productVtoConfig.update({
        where: {
            shop_productId: { shop, productId },
        },
        data: {
            selectedImageId,
            selectedImageUrl,
        },
    });
}

/**
 * Get products that are enabled but missing image selection
 */
export async function getProductsNeedingImageSelection(shop) {
    // Get all enabled products and filter those with empty selectedImageId
    const enabledProducts = await prisma.productVtoConfig.findMany({
        where: {
            shop,
            isEnabled: true,
        },
        orderBy: { createdAt: "asc" },
    });

    // Filter for missing images (empty string or null)
    return enabledProducts.filter(
        (p) => !p.selectedImageId || p.selectedImageId === ""
    );
}

/**
 * Check if all enabled products have images selected
 */
export async function allProductsHaveImages(shop) {
    // Get count of enabled products
    const enabledCount = await prisma.productVtoConfig.count({
        where: {
            shop,
            isEnabled: true,
        },
    });

    if (enabledCount === 0) {
        return false; // No products means images are not set up
    }

    // Get count of enabled products WITH images (non-empty selectedImageId)
    const withImagesCount = await prisma.productVtoConfig.count({
        where: {
            shop,
            isEnabled: true,
            selectedImageId: { not: "" },
        },
    });

    return withImagesCount === enabledCount;
}

/**
 * Get count of enabled products
 */
export async function getEnabledProductCount(shop) {
    return prisma.productVtoConfig.count({
        where: { shop, isEnabled: true },
    });
}

// ============ Onboarding Status ============

/**
 * Get or create onboarding status for a shop
 */
export async function getOnboardingStatus(shop) {
    const existing = await prisma.onboardingStatus.findUnique({
        where: { shop },
    });

    if (existing) return existing;

    return prisma.onboardingStatus.create({
        data: { shop },
    });
}

/**
 * Update onboarding status
 */
export async function updateOnboardingStatus(shop, data) {
    return prisma.onboardingStatus.upsert({
        where: { shop },
        create: {
            shop,
            ...data,
        },
        update: data,
    });
}

/**
 * Mark onboarding as complete
 */
export async function completeOnboarding(shop) {
    return prisma.onboardingStatus.upsert({
        where: { shop },
        create: {
            shop,
            productsSelected: true,
            imagesSelected: true,
            isComplete: true,
            completedAt: new Date(),
        },
        update: {
            productsSelected: true,
            imagesSelected: true,
            isComplete: true,
            completedAt: new Date(),
        },
    });
}

/**
 * Check if onboarding is complete
 */
export async function isOnboardingComplete(shop) {
    const status = await prisma.onboardingStatus.findUnique({
        where: { shop },
    });
    return status?.isComplete ?? false;
}
