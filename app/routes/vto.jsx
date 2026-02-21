import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "react-router";
import styles from "../styles/vto.module.css";

function safeText(value) {
  return String(value ?? "").slice(0, 300);
}

// ============ History helpers (localStorage) ============
const HISTORY_KEY = "vto_try_on_history";
const MAX_HISTORY = 20;

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function addToHistory(entry) {
  try {
    const history = getHistory();
    // Add to front, deduplicate by product handle
    const filtered = history.filter(
      (h) => h.productHandle !== entry.productHandle
    );
    filtered.unshift({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    // Keep only recent items
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(filtered.slice(0, MAX_HISTORY))
    );
  } catch {
    // localStorage might be disabled
  }
}

function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // noop
  }
}

// ============ Main component ============
export default function PublicVto() {
  const [params] = useSearchParams();

  const [fileUrl, setFileUrl] = useState("");
  // mode removed: strictly full_body now
  const [showCamera, setShowCamera] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [history, setHistory] = useState([]);
  const [cameraError, setCameraError] = useState("");

  // VTO processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [vtoProgress, setVtoProgress] = useState(0);
  const [vtoError, setVtoError] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const pollRef = useRef(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const title = safeText(
    params.get("title") || params.get("product_handle") || "Selected item"
  );
  const image = safeText(params.get("image") || "");
  const shop = safeText(params.get("shop") || "");
  const variantId = safeText(params.get("variant_id") || "");
  const productHandle = safeText(
    params.get("product_handle") || "unknown"
  );

  const productImage = useMemo(() => {
    try {
      return image ? new URL(image).toString() : "";
    } catch {
      return "";
    }
  }, [image]);

  // Load history on mount
  useEffect(() => {
    setHistory(getHistory());
    // Add current product to history
    if (title && title !== "Selected item") {
      addToHistory({
        title,
        productHandle,
        image: productImage,
        shop,
        variantId,
      });
    }
  }, [title, productHandle, productImage, shop, variantId]);

  // ============ Camera ============
  const startCamera = useCallback(async () => {
    setCameraError("");
    setShowCamera(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      streamRef.current = stream;

      // Wait for ref to be attached
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { });
        }
      });
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(
        err.name === "NotAllowedError"
          ? "Camera access was denied. Please allow camera access in your browser settings."
          : err.name === "NotFoundError"
            ? "No camera found on this device."
            : "Could not access camera. Please try uploading a photo instead."
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCameraError("");
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");

    // Mirror the image (selfie mode)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        setFileUrl(url);
        stopCamera();
      }
    }, "image/jpeg", 0.92);
  }, [stopCamera]);

  // Clean up camera & polling on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  // ============ VTO Processing ============
  const handleTryOn = useCallback(async () => {
    if (!fileUrl || !productImage) return;

    setIsProcessing(true);
    setVtoError("");
    setVtoProgress(5);
    setResultUrl("");

    try {
      // Convert blob URL to actual blob
      const blob = await fetch(fileUrl).then((r) => r.blob());

      const fd = new FormData();
      fd.append("person_image", blob, "photo.jpg");
      fd.append("garment_image", productImage);
      fd.append("shop", shop);
      fd.append("product_id", productHandle);
      fd.append("category", "tops");
      fd.append("session_id", `sess_${Date.now()}`);

      setVtoProgress(10);

      const res = await fetch("/api/vto-process", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!data.ok) {
        setVtoError(data.error || "Failed to submit try-on request.");
        setIsProcessing(false);
        return;
      }

      // If result is returned immediately (sync mode)
      if (data.resultUrl) {
        setResultUrl(data.resultUrl);
        setVtoProgress(100);
        setIsProcessing(false);
        return;
      }

      // Async mode: poll for results
      if (data.jobId) {
        setVtoProgress(20);
        pollForResult(data.jobId);
      } else {
        setVtoError("No job ID returned. Please try again.");
        setIsProcessing(false);
      }
    } catch (err) {
      console.error("VTO submit error:", err);
      setVtoError("Could not connect to the try-on server. Please try again.");
      setIsProcessing(false);
    }
  }, [fileUrl, productImage, shop, productHandle]);

  const pollForResult = useCallback(
    (jobId) => {
      let attempts = 0;
      const maxAttempts = 60; // poll for up to ~3 minutes

      pollRef.current = setInterval(async () => {
        attempts++;

        if (attempts > maxAttempts) {
          clearInterval(pollRef.current);
          setVtoError("Processing took too long. Please try again.");
          setIsProcessing(false);
          return;
        }

        try {
          const res = await fetch(
            `/api/vto-status?jobId=${encodeURIComponent(jobId)}&shop=${encodeURIComponent(shop)}`
          );
          const data = await res.json();

          if (data.status === "completed" && data.resultUrl) {
            clearInterval(pollRef.current);
            setResultUrl(data.resultUrl);
            setVtoProgress(100);
            setIsProcessing(false);
          } else if (data.status === "failed") {
            clearInterval(pollRef.current);
            setVtoError(data.error || "Try-on processing failed.");
            setIsProcessing(false);
          } else {
            // Still processing — update progress
            const progress = data.progress || Math.min(20 + attempts * 2, 90);
            setVtoProgress(progress);
          }
        } catch {
          // Network error — keep polling, might be transient
        }
      }, 3000);
    },
    [shop]
  );

  // ============ History panel ============
  const toggleHistory = useCallback(() => {
    setShowHistory((prev) => {
      if (!prev) {
        setHistory(getHistory());
      }
      return !prev;
    });
  }, []);

  const handleClearHistory = useCallback(() => {
    clearHistory();
    setHistory([]);
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {/* Top bar */}
        <div className={styles.topbar}>
          <button
            type="button"
            className={styles.topbarLink}
            onClick={toggleHistory}
          >
            <span aria-hidden="true">🕘</span> History
          </button>
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="Close"
            onClick={() => {
              try {
                window.close();
              } catch {
                // noop
              }
            }}
          >
            ×
          </button>
        </div>

        {/* History panel */}
        {showHistory && (
          <div className={styles.historyPanel}>
            <div className={styles.historyHeader}>
              <span className={styles.historyTitle}>Recent Try-Ons</span>
              {history.length > 0 && (
                <button
                  type="button"
                  className={styles.historyClearBtn}
                  onClick={handleClearHistory}
                >
                  Clear all
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className={styles.historyEmpty}>
                No try-on history yet. Start by trying on a product!
              </p>
            ) : (
              <div className={styles.historyList}>
                {history.map((item, i) => (
                  <div key={`${item.productHandle}-${i}`} className={styles.historyItem}>
                    {item.image ? (
                      <img
                        className={styles.historyThumb}
                        src={item.image}
                        alt={item.title}
                      />
                    ) : (
                      <div className={styles.historyThumb} aria-hidden="true" />
                    )}
                    <div className={styles.historyMeta}>
                      <p className={styles.historyItemTitle}>{item.title}</p>
                      <p className={styles.historyItemDate}>
                        {new Date(item.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={styles.headline}>Let&apos;s try it on</div>
        <p className={styles.subhead}>
          Upload a full-body photo to see how this item looks on you.
        </p>

        <div className={styles.card}>
          {/* Product info */}
          <div className={styles.productRow}>
            {productImage ? (
              <img className={styles.thumb} src={productImage} alt={title} />
            ) : (
              <div className={styles.thumb} aria-hidden="true" />
            )}
            <div className={styles.productMeta}>
              <p className={styles.productTitle} title={title}>
                {title}
              </p>
              <p className={styles.productSub}>
                <span>Shop: </span>
                <code>{shop || "—"}</code>
                {" · "}
                <span>Variant: </span>
                <code>{variantId || "—"}</code>
              </p>
            </div>
          </div>

          {/* Upload area */}
          <div className={styles.drop}>
            <div className={styles.dropInner}>
              <div className={styles.dropIcon} aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 3v10m0 0l-4-4m4 4l4-4M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4"
                    stroke="#0f172a"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className={styles.dropCta}>Upload Full Body Photo</p>
              <p className={styles.dropHint}>
                JPG or PNG. Good lighting works best.
              </p>

              <span className={styles.fileInput}>
                <button type="button" className={styles.primaryBtn}>
                  Choose file
                </button>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Upload full body photo"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    if (!f) return;
                    const url = URL.createObjectURL(f);
                    setFileUrl(url);
                  }}
                />
              </span>


            </div>
          </div>

          {/* Photo preview & Try On */}
          {fileUrl && !resultUrl && (
            <div className={styles.previewWrapper}>
              <img
                className={styles.previewImg}
                src={fileUrl}
                alt="Uploaded preview"
              />
              <div className={styles.previewActions}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => {
                    setFileUrl("");
                    setVtoError("");
                    setVtoProgress(0);
                  }}
                  disabled={isProcessing}
                >
                  Remove
                </button>
                <button
                  type="button"
                  className={`${styles.primaryBtn} ${styles.tryOnBtn}`}
                  onClick={handleTryOn}
                  disabled={isProcessing}
                >
                  {isProcessing ? "Processing..." : "Try On ✨"}
                </button>
              </div>

              {/* Progress bar */}
              {isProcessing && (
                <div style={{
                  marginTop: "12px", width: "100%", height: "6px",
                  backgroundColor: "#e5e7eb", borderRadius: "3px", overflow: "hidden",
                }}>
                  <div style={{
                    height: "100%", width: `${vtoProgress}%`,
                    backgroundColor: "#6366f1",
                    transition: "width 0.5s ease",
                    borderRadius: "3px",
                  }} />
                </div>
              )}
              {isProcessing && (
                <p style={{ textAlign: "center", fontSize: "13px", color: "#6b7280", marginTop: "6px" }}>
                  ✨ AI is generating your try-on... {vtoProgress}%
                </p>
              )}

              {/* Error */}
              {vtoError && (
                <p style={{
                  color: "#ef4444", textAlign: "center", fontSize: "13px",
                  marginTop: "8px", padding: "8px 12px",
                  backgroundColor: "#fef2f2", borderRadius: "6px",
                }}>
                  ⚠️ {vtoError}
                </p>
              )}
            </div>
          )}

          {/* Result display */}
          {resultUrl && (
            <div className={styles.previewWrapper}>
              <p style={{
                textAlign: "center", fontWeight: "600", fontSize: "15px",
                color: "#10b981", marginBottom: "8px",
              }}>
                ✅ Your Virtual Try-On is ready!
              </p>
              <img
                className={styles.previewImg}
                src={resultUrl}
                alt="Virtual Try-On result"
                style={{ borderRadius: "12px", boxShadow: "0 4px 16px rgba(0,0,0,0.12)" }}
              />
              <div className={styles.previewActions} style={{ marginTop: "12px" }}>
                <a
                  href={resultUrl}
                  download="tryon-result.jpg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.primaryBtn}
                  style={{ textDecoration: "none", textAlign: "center" }}
                >
                  Download
                </a>
                <button
                  type="button"
                  className={`${styles.primaryBtn} ${styles.tryOnBtn}`}
                  onClick={() => {
                    setResultUrl("");
                    setFileUrl("");
                    setVtoProgress(0);
                    setVtoError("");
                  }}
                >
                  Try Another
                </button>
              </div>
            </div>
          )}

          {/* Camera / Mirror Selfie button */}
          <button
            type="button"
            className={styles.secondaryCard}
            onClick={startCamera}
          >
            <span aria-hidden="true">📷</span>
            Take Mirror Selfie
          </button>
        </div>

        {/* Camera modal */}
        {showCamera && (
          <div className={styles.cameraOverlay}>
            <div className={styles.cameraModal}>
              <div className={styles.cameraHeader}>
                <span className={styles.cameraTitle}>Take a Photo</span>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={stopCamera}
                  aria-label="Close camera"
                >
                  ×
                </button>
              </div>

              {cameraError ? (
                <div className={styles.cameraError}>
                  <p>{cameraError}</p>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={stopCamera}
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className={styles.cameraBody}>
                  <video
                    ref={videoRef}
                    className={styles.cameraVideo}
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas
                    ref={canvasRef}
                    style={{ display: "none" }}
                  />
                  <div className={styles.cameraActions}>
                    <button
                      type="button"
                      className={styles.captureBtn}
                      onClick={capturePhoto}
                      aria-label="Capture photo"
                    >
                      <div className={styles.captureBtnInner} />
                    </button>
                  </div>
                  <p className={styles.cameraHint}>
                    Stand back for a full body shot. Good lighting helps!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          By using this service, you agree to our{" "}
          <button
            type="button"
            className={styles.footerLink}
            onClick={() => setShowTerms(true)}
          >
            Terms
          </button>{" "}
          and{" "}
          <button
            type="button"
            className={styles.footerLink}
            onClick={() => setShowPrivacy(true)}
          >
            Privacy Policy
          </button>
          .<br />
          AI can make mistakes.
        </div>

        {/* Terms Modal */}
        {showTerms && (
          <div
            className={styles.legalOverlay}
            onClick={() => setShowTerms(false)}
          >
            <div
              className={styles.legalModal}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.legalHeader}>
                <h2>Terms of Service</h2>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setShowTerms(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className={styles.legalBody}>
                <h3>1. Service Description</h3>
                <p>
                  The Virtual Try-On service allows you to visualize how
                  garments and products may appear when worn. Results are
                  AI-generated approximations and may not perfectly represent
                  the actual product fit, color, or appearance.
                </p>
                <h3>2. Photo Usage</h3>
                <p>
                  Photos you upload are processed temporarily for the sole
                  purpose of generating the try-on image. We do not store your
                  photos after processing is complete unless you explicitly
                  save a result.
                </p>
                <h3>3. Accuracy</h3>
                <p>
                  AI-generated try-on images are approximations. Actual product
                  appearance may vary based on lighting, body proportions, and
                  fabric behavior. Do not rely solely on try-on images for
                  purchasing decisions.
                </p>
                <h3>4. Acceptable Use</h3>
                <p>
                  You agree not to upload inappropriate, offensive, or
                  copyrighted content. The service is for personal use related
                  to product evaluation only.
                </p>
                <h3>5. Liability</h3>
                <p>
                  The Virtual Try-On service is provided "as is" without
                  warranty. We are not liable for purchase decisions made based
                  on AI-generated imagery.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Privacy Policy Modal */}
        {showPrivacy && (
          <div
            className={styles.legalOverlay}
            onClick={() => setShowPrivacy(false)}
          >
            <div
              className={styles.legalModal}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles.legalHeader}>
                <h2>Privacy Policy</h2>
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setShowPrivacy(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className={styles.legalBody}>
                <h3>Data We Collect</h3>
                <p>
                  When you use the Virtual Try-On feature, we temporarily
                  process the photo you upload. We also collect basic usage
                  data such as the product viewed and session timing.
                </p>
                <h3>Photo Processing</h3>
                <p>
                  Your uploaded photos are sent to our AI processing servers
                  over encrypted connections (HTTPS). Photos are processed in
                  memory and are not stored permanently on our servers. They
                  are automatically deleted after processing.
                </p>
                <h3>No PII Storage</h3>
                <p>
                  We do not store any personally identifiable information from
                  your photos. We do not use facial recognition to identify
                  individuals. Your biometric data is not retained.
                </p>
                <h3>Cookies &amp; Local Storage</h3>
                <p>
                  We use local storage in your browser to remember your try-on
                  history for convenience. You can clear this history at any
                  time from the app. No tracking cookies are used.
                </p>
                <h3>Third Parties</h3>
                <p>
                  We do not sell or share your data with third parties for
                  marketing purposes. AI processing may use third-party
                  infrastructure but your data is processed under our data
                  processing agreements.
                </p>
                <h3>Your Rights</h3>
                <p>
                  You have the right to request deletion of any data
                  associated with your use. Contact the store owner for any
                  data-related requests.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
