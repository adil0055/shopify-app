// @ts-nocheck
import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  InlineStack,
  Checkbox,
  Text,
  Image,
  Box,
  Banner,
  Pressable,
} from '@shopify/ui-extensions-react/admin';
import { useState, useEffect, useCallback } from 'react';

// The target used here must match the target in your shopify.extension.toml
const TARGET = 'admin.product-details.block.render';

export default reactExtension(TARGET, () => <App />);

function App() {
  // @ts-ignore
  const { data } = useApi();
  // Ensure we get the product ID correctly from the extension data context
  const productId = data?.selected?.[0]?.id || data?.product?.id;

  const [isEnabled, setIsEnabled] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState('');
  const [productImages, setProductImages] = useState([]);
  const [productTitle, setProductTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [statusTone, setStatusTone] = useState('info');
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    // 🚨 ABSOLUTE GUARD
    if (!productId || typeof productId !== "string") {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadConfig = async () => {
      try {
        setLoading(true);

        const response = await fetch(
          `/app/api/vto-product-config?productId=${encodeURIComponent(productId)}`
        );

        // ✅ Ignore 404 during creation lifecycle
        if (response.status === 404) {
          if (isMounted) setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}`);
        }

        const result = await response.json();

        if (!isMounted) return;

        setIsEnabled(!!result.enabled);
        setSelectedImageId(result.selectedImageId || '');
        setProductImages(result.images || []);
        // Note: productTitle is not strictly needed for display if we have images, 
        // but we can set it if we want. The user snippet sets it.
        setProductTitle(result.productTitle || '');

        // Also ensure isReady is true if we have loaded successfully


      } catch (err) {
        console.error('VTO load error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadConfig();

    return () => {
      isMounted = false;
    };

  }, [productId]);

  // Save configuration
  const saveConfig = useCallback(
    async (enabled, imageId) => {
      if (!productId) return;

      try {
        setSaving(true);
        setStatusMsg('');

        const selectedImage = productImages.find((img) => img.id === imageId);

        const payload = {
          productId,
          productTitle,
          isEnabled: enabled,
          selectedImageId: enabled ? imageId : '',
          selectedImageUrl: enabled && selectedImage ? selectedImage.url : '',
          productImage: productImages[0]?.url || '',
        };

        const response = await fetch('/app/api/vto-product-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const text = await response.text();
          console.error("Save error:", text);
          throw new Error('Failed to save');
        }

        setStatusMsg('Saved!');
        setStatusTone('success');
        setTimeout(() => setStatusMsg(''), 2500);
      } catch (err) {
        console.error('Error saving VTO config:', err);
        setStatusMsg('Failed to save. Please try again.');
        setStatusTone('critical');
      } finally {
        setSaving(false);
      }
    },
    [productId, productTitle, productImages]
  );

  const handleToggle = useCallback(
    (newChecked) => {
      setIsEnabled(newChecked);
      // Auto-save when toggling. If turning off, clear selection in saved data (optional)
      // or keep selection in state but save as disabled.
      saveConfig(newChecked, selectedImageId);
    },
    [selectedImageId, saveConfig]
  );

  const handleImageSelect = useCallback(
    (imageId) => {
      setSelectedImageId(imageId);
      setIsPickerOpen(false);
      // Auto-save on selection if enabled
      if (isEnabled) {
        saveConfig(true, imageId);
      }
    },
    [isEnabled, saveConfig]
  );





  if (loading) {
    return (
      <AdminBlock title="Virtual Try-On">
        <BlockStack inlineAlignment="center" gap="base">
          <Text>Loading VTO settings...</Text>
        </BlockStack>
      </AdminBlock>
    );
  }

  const selectedImage = productImages.find(img => img.id === selectedImageId);

  return (
    <AdminBlock title="Virtual Try-On">
      <BlockStack gap="base">
        {statusMsg && (
          <Banner tone={statusTone} onDismiss={() => setStatusMsg('')}>
            <Text>{statusMsg}</Text>
          </Banner>
        )}

        <Checkbox
          checked={isEnabled}
          disabled={!productId}
          onChange={handleToggle}
          label="Enable Virtual Try-On for this product"
        />

        {isEnabled && (
          <Box paddingBlockStart="base">
            <BlockStack gap="base">

              {/* COMPACT VIEW: Selected Image or "Select" Placeholder */}
              {!isPickerOpen && (
                <InlineStack gap="base" blockAlignment="center">
                  {selectedImage ? (
                    <>
                      <Box
                        padding="extraTight"
                        border="base"
                        borderRadius="base"
                        inlineSize={64}
                        blockSize={64}
                        align="center"
                        blockAlignment="center"
                        background="subdued"
                      >
                        <Image
                          source={selectedImage.url.includes('?') ? `${selectedImage.url}&width=128` : `${selectedImage.url}?width=128`}
                          accessibilityDescription={selectedImage.altText || 'Selected VTO Image'}
                        />
                      </Box>
                      <BlockStack gap="none">
                        <Text fontWeight="bold" variant="bodyMd">Garment Image</Text>
                        <Pressable onPress={() => setIsPickerOpen(true)}>
                          <Text tone="magic-subdued" fontWeight="bold">Change image</Text>
                        </Pressable>
                      </BlockStack>
                    </>
                  ) : (
                    <Pressable onPress={() => setIsPickerOpen(true)}>
                      <InlineStack gap="small" blockAlignment="center">
                        <Box padding="small" border="base" borderRadius="base">
                          <Text>📷</Text>
                        </Box>
                        <Text tone="magic" fontWeight="bold">Select garment image</Text>
                      </InlineStack>
                    </Pressable>
                  )}
                </InlineStack>
              )}

              {/* PICKER VIEW: Grid of Images */}
              {isPickerOpen && (
                <BlockStack gap="base">
                  <InlineStack align="start" blockAlignment="center" inlineSize="100%">
                    <Text fontWeight="bold">Select garment image</Text>
                  </InlineStack>

                  {productImages.length > 0 ? (
                    <Box overflow="auto" maxBlockSize={110}>
                      <InlineStack gap="extraTight" blockAlignment="center" wrap={false}>
                        {productImages.map((image) => {
                          const isSelected = selectedImageId === image.id;
                          return (
                            <Pressable
                              key={image.id}
                              onPress={() => handleImageSelect(image.id)}
                            >
                              <Box
                                border={isSelected ? "highlight" : "base"}
                                borderWidth={isSelected ? "medium" : "thin"}
                                borderRadius="base"
                                inlineSize={64}
                                blockSize={64}
                                padding="extraTight"
                                align="center"
                                blockAlignment="center"
                                background="subdued"
                              >
                                <Image
                                  source={image.url.includes('?') ? `${image.url}&width=128` : `${image.url}?width=128`}
                                  accessibilityDescription={image.altText || 'Product image'}
                                />
                              </Box>
                            </Pressable>
                          );
                        })}
                      </InlineStack>
                    </Box>
                  ) : (
                    <Banner tone="warning">
                      <Text>No images found for this product.</Text>
                    </Banner>
                  )}
                  <Box paddingBlockStart="tight">
                    <BlockStack inlineAlignment="end">
                      <Pressable onPress={() => setIsPickerOpen(false)}>
                        <Text tone="critical">Cancel</Text>
                      </Pressable>
                    </BlockStack>
                  </Box>
                </BlockStack>
              )}

            </BlockStack>
          </Box>
        )}

        {saving && (
          <Text>Saving changes...</Text>
        )}
      </BlockStack>
    </AdminBlock>
  );
}