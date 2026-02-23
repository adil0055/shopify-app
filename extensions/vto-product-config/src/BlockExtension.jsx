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

const TARGET = 'admin.product-details.block.render';

export default reactExtension(TARGET, () => <App />);

function App() {
  const api = useApi();
  const { data, auth } = api;

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
  const [authError, setAuthError] = useState(false);

  const getAuthHeaders = useCallback(async () => {
    const token = await auth.idToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, [auth]);

  useEffect(() => {
    if (!productId || typeof productId !== 'string') {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadConfig = async () => {
      try {
        setLoading(true);
        setAuthError(false);

        const headers = await getAuthHeaders();

        const response = await fetch(
          `/api/vto-product-config?productId=${encodeURIComponent(productId)}`,
          { headers }
        );

        if (response.status === 404) {
          if (isMounted) setLoading(false);
          return;
        }

        if (response.status === 401 || response.status === 403) {
          if (isMounted) {
            setAuthError(true);
            setLoading(false);
          }
          return;
        }

        if (!response.ok) {
          const text = await response.text();
          console.error('[VTO] GET failed:', response.status, text.slice(0, 200));
          throw new Error(`Backend returned ${response.status}`);
        }

        const result = await response.json();
        if (!isMounted) return;

        setIsEnabled(!!result.enabled);
        setSelectedImageId(result.selectedImageId || '');
        setProductImages(result.images || []);
        setProductTitle(result.productTitle || '');
      } catch (err) {
        console.error('[VTO] Load error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadConfig();
    return () => { isMounted = false; };
  }, [productId, getAuthHeaders]);

  const saveConfig = useCallback(
    async (enabled, imageId) => {
      if (!productId) return;

      try {
        setSaving(true);
        setStatusMsg('');

        const headers = await getAuthHeaders();
        const selectedImage = productImages.find((img) => img.id === imageId);

        const payload = {
          productId,
          productTitle,
          isEnabled: enabled,
          selectedImageId: enabled ? imageId : '',
          selectedImageUrl: enabled && selectedImage ? selectedImage.url : '',
          productImage: productImages[0]?.url || '',
        };

        const response = await fetch('/api/vto-product-config', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (response.status === 401 || response.status === 403) {
          setStatusMsg('Session expired. Please refresh the page.');
          setStatusTone('critical');
          return;
        }

        if (!response.ok) {
          const text = await response.text();
          console.error('[VTO] POST failed:', response.status, text.slice(0, 200));
          throw new Error('Failed to save');
        }

        setStatusMsg('Saved!');
        setStatusTone('success');
        setTimeout(() => setStatusMsg(''), 2500);
      } catch (err) {
        console.error('[VTO] Error saving config:', err);
        setStatusMsg('Failed to save. Please try again.');
        setStatusTone('critical');
      } finally {
        setSaving(false);
      }
    },
    [productId, productTitle, productImages, getAuthHeaders]
  );

  const handleToggle = useCallback(
    (newChecked) => {
      setIsEnabled(newChecked);
      saveConfig(newChecked, selectedImageId);
    },
    [selectedImageId, saveConfig]
  );

  const handleImageSelect = useCallback(
    (imageId) => {
      setSelectedImageId(imageId);
      setIsPickerOpen(false);
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

  if (authError) {
    return (
      <AdminBlock title="Virtual Try-On">
        <Banner tone="critical">
          <Text>Authentication failed. Please refresh the product page.</Text>
        </Banner>
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
                                border={isSelected ? 'highlight' : 'base'}
                                borderWidth={isSelected ? 'medium' : 'thin'}
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