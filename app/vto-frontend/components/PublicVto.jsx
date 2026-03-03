import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { TUCK_LOGO } from "./logo.js";
// CSS is compiled separately


function safeText(value) {
  return String(value ?? "").slice(0, 300);
}

// ============ User + History helpers (localStorage) ============
const HISTORY_KEY = "vto_try_on_history";
const INFO_KEY = "vto_user_info";
const GUEST_ID_KEY = "vto_guest_id";
const GUEST_HAS_IMAGE_KEY = "vto_guest_has_image";
const MAX_HISTORY = 20;

// Generate a crypto-quality UUID v4, falling back to Math.random
function generateUUID() {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

function getOrCreateGuestId() {
  try {
    let id = localStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = `guest_${generateUUID()}`;
      localStorage.setItem(GUEST_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable, generate an ephemeral one
    return `guest_${generateUUID()}`;
  }
}

function getGuestHasImage() {
  try {
    return localStorage.getItem(GUEST_HAS_IMAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setGuestHasImage(value) {
  try {
    localStorage.setItem(GUEST_HAS_IMAGE_KEY, String(value));
  } catch { }
}

function getStoredUserInfo() {
  try {
    const raw = localStorage.getItem(INFO_KEY);
    return raw ? JSON.parse(raw) : { gender: "Male", age: "23", height: "175", weight: "95", fit: "3" };
  } catch {
    return { gender: "Male", age: "23", height: "175", weight: "95", fit: "3" };
  }
}

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

// App Proxy URL resolver
function getApiUrl(endpoint) {
  try {
    let base = window.location.pathname;
    if (base.endsWith("/vto")) base = base.slice(0, -4);
    if (base.endsWith("/")) base = base.slice(0, -1);
    return `${base}${endpoint}`;
  } catch (e) {
    return endpoint;
  }
}

// ============ Translations ============
const translations = {
  en: {
    myInfo: "My Info", history: "History", recentTryOns: "Recent Try-Ons", clearAll: "Clear all",
    noHistory: "No try-on history yet. Start by trying on a product!",
    virtualTryOn: "Virtual Try-On",
    seeHowItLooks: "See how this item looks on you before buying.",
    signInRequired: "Sign in Required",
    loginToUse: "Please log in to your store account to use this feature.",
    logIn: "Log In",
    uploadFullBody: "Upload Full Body Photo",
    jpgPngHint: "JPG or PNG. Good lighting works best.",
    chooseFile: "Choose file",
    cancel: "Cancel",
    bodyProfileSaved: "Body Profile Saved",
    defaultImageHint: "Your default fitting image will be used.",
    generateTryOn: "Generate Try-On",
    changePhoto: "Change Photo",
    processing: "Processing...",
    processingImage: "Processing Image...",
    remove: "Remove",
    tryOnReady: "Try-On Ready",
    downloadImage: "Download Image",
    tryAnother: "Try Another",
    takeMirrorSelfie: "Take Mirror Selfie",
    takePhoto: "Take a Photo",
    capturePhoto: "Capture Photo",
    deleteData: "Delete your data",
    saveProfile: "Save Profile",
    gender: "Gender", age: "Age", height: "Height (cm)", weight: "Weight (kg)", bodyFit: "Body Fit",
    skinTight: "Skin Tight", regularFlow: "Regular Flow", somewhatLoose: "Somewhat Loose", veryLoose: "Very Loose", oversized: "Oversized"
  },
  fr: {
    myInfo: "Mes infos", history: "Historique", recentTryOns: "Essayages récents", clearAll: "Tout effacer",
    noHistory: "Aucun historique. Commencez par essayer un produit !",
    virtualTryOn: "Essayage Virtuel",
    seeHowItLooks: "Découvrez comment cet article vous va avant d'acheter.",
    signInRequired: "Connexion requise",
    loginToUse: "Veuillez vous connecter à votre compte boutique pour utiliser cette fonctionnalité.",
    logIn: "Se connecter",
    uploadFullBody: "Télécharger une photo",
    jpgPngHint: "JPG ou PNG. Un bon éclairage est préférable.",
    chooseFile: "Choisir un fichier",
    cancel: "Annuler",
    bodyProfileSaved: "Profil enregistré",
    defaultImageHint: "Votre image d'essayage par défaut sera utilisée.",
    generateTryOn: "Générer l'essayage",
    changePhoto: "Changer de photo",
    processing: "Traitement...",
    processingImage: "Traitement de l'image...",
    remove: "Supprimer",
    tryOnReady: "Essayage prêt",
    downloadImage: "Télécharger l'image",
    tryAnother: "Essayer un autre",
    takeMirrorSelfie: "Prendre un selfie",
    takePhoto: "Prendre une photo",
    capturePhoto: "Capturer la photo",
    deleteData: "Supprimer vos données",
    saveProfile: "Enregistrer le profil",
    gender: "Genre", age: "Âge", height: "Taille (cm)", weight: "Poids (kg)", bodyFit: "Coupe",
    skinTight: "Moulant", regularFlow: "Normal", somewhatLoose: "Un peu ample", veryLoose: "Très ample", oversized: "Oversize"
  },
  es: {
    myInfo: "Mi Info", history: "Historial", recentTryOns: "Pruebas recientes", clearAll: "Borrar todo",
    noHistory: "Sin historial. ¡Empieza por probarte un producto!",
    virtualTryOn: "Prueba Virtual",
    seeHowItLooks: "Mira cómo te queda este artículo antes de comprar.",
    signInRequired: "Inicio de sesión requerido",
    loginToUse: "Inicia sesión en tu cuenta para usar esta función.",
    logIn: "Iniciar sesión",
    uploadFullBody: "Subir foto de cuerpo",
    jpgPngHint: "JPG o PNG. Una buena iluminación es mejor.",
    chooseFile: "Elegir archivo",
    cancel: "Cancelar",
    bodyProfileSaved: "Perfil guardado",
    defaultImageHint: "Se utilizará su imagen de prueba predeterminada.",
    generateTryOn: "Generar prueba",
    changePhoto: "Cambiar foto",
    processing: "Procesando...",
    processingImage: "Procesando imagen...",
    remove: "Eliminar",
    tryOnReady: "Prueba lista",
    downloadImage: "Descargar imagen",
    tryAnother: "Probar otro",
    takeMirrorSelfie: "Tomar selfie al espejo",
    takePhoto: "Tomar una foto",
    capturePhoto: "Capturar foto",
    deleteData: "Eliminar tus datos",
    saveProfile: "Guardar perfil",
    gender: "Género", age: "Edad", height: "Altura (cm)", weight: "Peso (kg)", bodyFit: "Ajuste",
    skinTight: "Apretado", regularFlow: "Regular", somewhatLoose: "Un poco suelto", veryLoose: "Muy suelto", oversized: "Oversize"
  },
  de: {
    myInfo: "Meine Info", history: "Verlauf", recentTryOns: "Letzte Anproben", clearAll: "Alle löschen",
    noHistory: "Noch kein Verlauf. Probieren Sie ein Produkt an!",
    virtualTryOn: "Virtuelle Anprobe",
    seeHowItLooks: "Sehen Sie, wie dieser Artikel an Ihnen aussieht, bevor Sie kaufen.",
    signInRequired: "Anmeldung erforderlich",
    loginToUse: "Bitte loggen Sie sich in Ihr Konto ein, um diese Funktion zu nutzen.",
    logIn: "Einloggen",
    uploadFullBody: "Ganzkörperfoto hochladen",
    jpgPngHint: "JPG oder PNG. Gute Beleuchtung ist am besten.",
    chooseFile: "Datei wählen",
    cancel: "Abbrechen",
    bodyProfileSaved: "Körperprofil gespeichert",
    defaultImageHint: "Ihr Standard-Anprobebild wird verwendet.",
    generateTryOn: "Anprobe generieren",
    changePhoto: "Foto ändern",
    processing: "Wird bearbeitet...",
    processingImage: "Bild wird bearbeitet...",
    remove: "Entfernen",
    tryOnReady: "Anprobe fertig",
    downloadImage: "Bild herunterladen",
    tryAnother: "Ein anderes probieren",
    takeMirrorSelfie: "Spiegel-Selfie machen",
    takePhoto: "Ein Foto machen",
    capturePhoto: "Foto aufnehmen",
    deleteData: "Ihre Daten löschen",
    saveProfile: "Profil speichern",
    gender: "Geschlecht", age: "Alter", height: "Größe (cm)", weight: "Gewicht (kg)", bodyFit: "Passform",
    skinTight: "Eng anliegend", regularFlow: "Normal", somewhatLoose: "Etwas locker", veryLoose: "Sehr locker", oversized: "Oversized"
  }
};

// ============ Main component ============
export default function PublicVto() {
  const [params] = useState(() => new URLSearchParams(window.location.search));

  const [fileUrl, setFileUrl] = useState("");
  // Modals / Overlays
  const [showCamera, setShowCamera] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // User Info Data mapping
  const [userInfo, setUserInfo] = useState(getStoredUserInfo);

  // Save user info on change
  useEffect(() => {
    try {
      localStorage.setItem(INFO_KEY, JSON.stringify(userInfo));
    } catch { }
  }, [userInfo]);

  const handleDeleteData = () => {
    setUserInfo({ gender: "Male", age: "", height: "", weight: "", fit: "3" });
    try {
      localStorage.removeItem(INFO_KEY);
      // Also clear guest-specific data
      localStorage.removeItem(GUEST_ID_KEY);
      localStorage.removeItem(GUEST_HAS_IMAGE_KEY);
    } catch { }
    // Reset hasImage so upload area reappears
    setHasImage(false);
  };
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
  const rawCustomerId = safeText(params.get("customer_id") || "");
  const rawHasImage = params.get("has_image") === "true";
  const allowGuest = params.get("allow_guest") === "true";
  const langParam = params.get("lang");

  // Resolve correct language dictionary
  const resolvedLang = (langParam && translations[langParam]) ? langParam : "en";
  const t = translations[resolvedLang];

  const isLoggedIn = !!rawCustomerId;
  // Access is granted if logged in OR if the merchant allows guest access
  const hasAccess = isLoggedIn || allowGuest;

  // Compute userId — stable across sessions for both logged-in and guest users
  const [userId] = useState(() => {
    if (rawCustomerId) return `shopify_cust_${rawCustomerId}`;
    // For guest users, retrieve or create a persistent localStorage-backed UUID
    if (allowGuest) return getOrCreateGuestId();
    return null;
  });

  // Track if they have an image
  // For logged-in users: from Shopify metafield (rawHasImage)
  // For guest users: from localStorage
  const [hasImage, setHasImage] = useState(() => {
    if (isLoggedIn) return rawHasImage;
    if (allowGuest) return getGuestHasImage();
    return false;
  });

  // Sync guest hasImage to localStorage whenever it changes
  useEffect(() => {
    if (!isLoggedIn && allowGuest) {
      setGuestHasImage(hasImage);
    }
  }, [hasImage, isLoggedIn, allowGuest]);

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
    if (!productImage) return;
    if (!hasImage && !fileUrl) return; // Prevent submission if no image exists and no file uploaded

    setIsProcessing(true);
    setVtoError("");
    setVtoProgress(5);
    setResultUrl("");

    try {
      const fd = new FormData();
      fd.append("user_id", userId);
      fd.append("garment_image", productImage);
      fd.append("shop", shop);
      fd.append("product_id", productHandle);
      fd.append("category", "tops");
      fd.append("session_id", `sess_${Date.now()}`);

      // Size preferences (from the Information modal)
      fd.append("gender", userInfo.gender);
      fd.append("age", userInfo.age);
      fd.append("height", userInfo.height);
      fd.append("weight", userInfo.weight);
      fd.append("fit_preference", userInfo.fit);

      // If they picked a new file, append it. Otherwise leave it out (Python uses saved one)
      if (fileUrl) {
        const blob = await fetch(fileUrl).then((r) => r.blob());
        fd.append("person_image", blob, "photo.jpg");
      } else {
        // Submitting with existing image; we just let backend know they are using their saved one (implied by missing person_image)
      }

      setVtoProgress(10);

      const res = await fetch(getApiUrl("/api/vto-process"), {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!data.ok) {
        setVtoError(data.error || "Failed to submit try-on request.");
        setIsProcessing(false);
        return;
      }

      // Successfully submitted an image file. They now 'have an image'.
      setHasImage(true);
      setIsChangingPhoto(false);

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
  }, [fileUrl, productImage, shop, productHandle, userId, hasImage, rawCustomerId]);

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
            getApiUrl(`/api/vto-status?jobId=${encodeURIComponent(jobId)}&shop=${encodeURIComponent(shop)}`)
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
    <div className="page">
      <div className="shell">
        {/* Top bar */}
        <div className="topbar">
          <button
            type="button"
            className="topbarLink"
            onClick={() => setShowInfo(true)}
          >
            {t.myInfo}
          </button>
          <button
            type="button"
            className="topbarLink"
            onClick={toggleHistory}
          >
            {t.history}
          </button>
          <button
            type="button"
            className="closeBtn"
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
          <div className="historyPanel">
            <div className="historyHeader">
              <span className="historyTitle">{t.recentTryOns}</span>
              {history.length > 0 && (
                <button
                  type="button"
                  className="historyClearBtn"
                  onClick={handleClearHistory}
                >
                  {t.clearAll}
                </button>
              )}
            </div>
            {history.length === 0 ? (
              <p className="historyEmpty">
                {t.noHistory}
              </p>
            ) : (
              <div className="historyList">
                {history.map((item, i) => (
                  <div key={`${item.productHandle}-${i}`} className="historyItem">
                    {item.image ? (
                      <img
                        className="historyThumb"
                        src={item.image}
                        alt={item.title}
                      />
                    ) : (
                      <div className="historyThumb" aria-hidden="true" />
                    )}
                    <div className="historyMeta">
                      <p className="historyItemTitle">{item.title}</p>
                      <p className="historyItemDate">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card">
          <div className="headerBlock">
            <h1 className="headline">{t.virtualTryOn}</h1>
            <p className="subhead">{t.seeHowItLooks}</p>
          </div>

          {!hasAccess ? (
            <div className="drop" style={{ borderStyle: "solid", textAlign: "center", padding: "40px 20px" }}>
              <div className="dropInner">
                <div className="dropIcon" aria-hidden="true" style={{ background: "transparent", borderColor: "#000", color: "#000", marginBottom: "16px", borderRadius: "0" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path d="M12 11c1.657 0 3-1.343 3-3S13.657 5 12 5 9 6.343 9 8s1.343 3 3 3zm0 2c-2.67 0-8 1.337-8 4v3h16v-3c0-2.663-5.33-4-8-4z" fill="currentColor" />
                  </svg>
                </div>
                <p className="dropCta" style={{ fontSize: "16px", marginBottom: "8px", textTransform: "uppercase" }}>{t.signInRequired}</p>
                <p className="dropHint" style={{ marginBottom: "24px" }}>
                  {t.loginToUse}
                </p>
                <a
                  href="/account/login"
                  target="_top"
                  className="primaryBtn"
                  style={{ textDecoration: "none", width: "auto", display: "inline-flex" }}
                >
                  {t.logIn}
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Product info */}
              <div className="productRow">
                {productImage ? (
                  <img className="thumb" src={productImage} alt={title} />
                ) : (
                  <div className="thumb" aria-hidden="true" />
                )}
                <div className="productMeta">
                  <h2 className="productTitle" title={title}>
                    {title}
                  </h2>
                  <p className="productPrice">$98.00 USD</p>
                  <p className="productSub">
                    <span>Size: M</span>
                    {" · "}
                    <span>Fabric: 100% Cotton</span>
                  </p>
                </div>
              </div>

              {/* Upload area - Only show if they DO NOT have an image, OR if they explicitly clicked Change Photo */}
              {(!hasImage || isChangingPhoto) && !fileUrl && !resultUrl && (
                <div className="drop">
                  <div className="dropInner">
                    <div className="dropIcon" aria-hidden="true">
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
                    <p className="dropCta">{t.uploadFullBody}</p>
                    <p className="dropHint">
                      {t.jpgPngHint}
                    </p>

                    <span className="fileInput">
                      <button type="button" className="primaryBtn">
                        {t.chooseFile}
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

                    {hasImage && isChangingPhoto && (
                      <button
                        type="button"
                        style={{ marginTop: "12px", background: "none", border: "none", color: "#64748b", textDecoration: "underline", cursor: "pointer", fontSize: "14px" }}
                        onClick={() => setIsChangingPhoto(false)}
                      >
                        {t.cancel}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Quick Try-On state (They already have an image and aren't changing it) */}
              {hasImage && !isChangingPhoto && !fileUrl && !resultUrl && (
                <div className="drop">
                  <div className="dropInner">
                    <div className="dropIcon" aria-hidden="true" style={{ background: "#ffffff", borderColor: "#000000" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <p className="dropCta">{t.bodyProfileSaved}</p>
                    <p className="dropHint">
                      {t.defaultImageHint}
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center", width: "100%" }}>
                      <button
                        type="button"
                        className="primaryBtn"
                        style={{ width: "100%", maxWidth: "240px" }}
                        onClick={handleTryOn}
                        disabled={isProcessing}
                      >
                        {isProcessing ? t.processing : t.generateTryOn}
                      </button>
                      <button
                        type="button"
                        style={{ background: "none", border: "none", color: "#64748b", textDecoration: "underline", cursor: "pointer", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}
                        onClick={() => setIsChangingPhoto(true)}
                        disabled={isProcessing}
                      >
                        {t.changePhoto}
                      </button>
                    </div>
                  </div>

                  {/* Progress and status indicators for Quick Try-On */}
                  {isProcessing && (
                    <div className="progressContainer">
                      <div className="progressBarTrack">
                        <div className="progressBarFill" style={{ width: `${vtoProgress}%` }} />
                      </div>
                      <p className="progressText">
                        {t.processingImage} {vtoProgress}%
                      </p>
                    </div>
                  )}
                  {vtoError && (
                    <p style={{
                      color: "#ef4444", textAlign: "center", fontSize: "13px",
                      marginTop: "16px", padding: "8px 12px",
                      backgroundColor: "#fef2f2", border: "1px solid #fca5a5"
                    }}>
                      {vtoError}
                    </p>
                  )}
                </div>
              )}

              {/* Photo preview & Try On */}
              {fileUrl && !resultUrl && (
                <div className="previewWrapper">
                  <img
                    className="previewImg"
                    src={fileUrl}
                    alt="Uploaded preview"
                  />
                  <div className="previewActions">
                    <button
                      type="button"
                      className="secondaryBtn"
                      onClick={() => {
                        setFileUrl("");
                        setVtoError("");
                        setVtoProgress(0);
                      }}
                      disabled={isProcessing}
                    >
                      {t.remove}
                    </button>
                    <button
                      type="button"
                      className="primaryBtn"
                      onClick={handleTryOn}
                      disabled={isProcessing}
                    >
                      {isProcessing ? t.processing : t.generateTryOn}
                    </button>
                  </div>

                  {/* Progress bar */}
                  {isProcessing && (
                    <div className="progressContainer">
                      <div className="progressBarTrack">
                        <div className="progressBarFill" style={{ width: `${vtoProgress}%` }} />
                      </div>
                      <p className="progressText">
                        {t.processingImage} {vtoProgress}%
                      </p>
                    </div>
                  )}

                  {/* Error */}
                  {vtoError && (
                    <p style={{
                      color: "#ef4444", textAlign: "center", fontSize: "13px",
                      marginTop: "16px", padding: "8px 12px",
                      backgroundColor: "#fef2f2", border: "1px solid #fca5a5"
                    }}>
                      {vtoError}
                    </p>
                  )}
                </div>
              )}

              {/* Result display */}
              {resultUrl && (
                <div className="previewWrapper">
                  <p style={{
                    textAlign: "center", fontWeight: "600", fontSize: "14px",
                    color: "#000000", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em"
                  }}>
                    {t.tryOnReady}
                  </p>
                  <img
                    className="previewImg"
                    src={resultUrl}
                    alt="Virtual Try-On result"
                    style={{ borderRadius: "0", boxShadow: "none" }}
                  />
                  <div className="previewActions" style={{ marginTop: "12px", width: "100%", maxWidth: "320px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <a
                      href={resultUrl}
                      download="tryon-result.jpg"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="primaryBtn"
                      style={{ textDecoration: "none", textAlign: "center" }}
                    >
                      {t.downloadImage}
                    </a>
                    <button
                      type="button"
                      className="secondaryBtn"
                      onClick={() => {
                        setResultUrl("");
                        setFileUrl("");
                        setVtoProgress(0);
                        setVtoError("");
                      }}
                    >
                      {t.tryAnother}
                    </button>
                  </div>
                </div>
              )}

              {/* Camera / Mirror Selfie button */}
              {(!hasImage || isChangingPhoto) && !fileUrl && !resultUrl && (
                <button
                  type="button"
                  className="secondaryCard"
                  onClick={startCamera}
                >
                  {t.takeMirrorSelfie}
                </button>
              )}
            </>
          )}
        </div>

        {/* Camera modal */}
        {showCamera && (
          <div className="cameraOverlay">
            <div className="cameraModal">
              <div className="cameraHeader">
                <span className="cameraTitle">{t.takePhoto}</span>
                <button
                  type="button"
                  className="closeBtn"
                  onClick={stopCamera}
                  aria-label="Close camera"
                >
                  ×
                </button>
              </div>

              {cameraError ? (
                <div className="cameraError">
                  <p>{cameraError}</p>
                  <button
                    type="button"
                    className="primaryBtn"
                    onClick={stopCamera}
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="cameraBody">
                  <video
                    ref={videoRef}
                    className="cameraVideo"
                    autoPlay
                    playsInline
                    muted
                  />
                  <canvas
                    ref={canvasRef}
                    style={{ display: "none" }}
                  />
                  <div className="cameraActions">
                    <button
                      type="button"
                      className="captureBtn"
                      onClick={capturePhoto}
                      aria-label="Capture photo"
                    >
                      <div className="captureBtnInner" />
                    </button>
                  </div>
                  <p className="cameraHint">
                    Stand back for a full body shot. Good lighting helps!
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="footer">
          <div style={{ marginBottom: "8px" }}>
            By using this service, you agree to our{" "}
            <button
              type="button"
              className="footerLink"
              onClick={() => setShowTerms(true)}
            >
              Terms
            </button>{" "}
            and{" "}
            <button
              type="button"
              className="footerLink"
              onClick={() => setShowPrivacy(true)}
            >
              Privacy Policy
            </button>
            .<br />
            AI can make mistakes.
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "16px", opacity: "0.8" }}>
            <span style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>Powered by</span>
            <img src={TUCK_LOGO} alt="Tuckk Logo" style={{ height: "14px", width: "auto" }} />
          </div>
        </div>

        {/* Info / Settings Modal */}
        {showInfo && (
          <div className="cameraOverlay">
            <div className="cameraModal">
              <div className="cameraHeader">
                <h2 className="cameraTitle" style={{ textTransform: "none" }}>Your information</h2>
                <button
                  type="button"
                  className="closeBtn"
                  onClick={() => setShowInfo(false)}
                >
                  ×
                </button>
              </div>
              <div className="cameraBody" style={{ paddingTop: "20px" }}>
                <div className="vtoFormGroup">
                  <label className="vtoLabel">Gender</label>
                  <select
                    className="vtoSelect"
                    value={userInfo.gender}
                    onChange={(e) => setUserInfo({ ...userInfo, gender: e.target.value })}
                  >
                    <option>Male</option>
                    <option>Female</option>
                  </select>
                </div>

                <div className="vtoFormGroup">
                  <label className="vtoLabel">Age</label>
                  <input
                    type="number"
                    className="vtoInput"
                    value={userInfo.age}
                    onChange={(e) => setUserInfo({ ...userInfo, age: e.target.value })}
                  />
                </div>

                <div className="vtoRow">
                  <div>
                    <label className="vtoLabel">Height (cm)</label>
                    <input
                      type="number"
                      className="vtoInput"
                      value={userInfo.height}
                      onChange={(e) => setUserInfo({ ...userInfo, height: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="vtoLabel">Weight (kg)</label>
                    <input
                      type="number"
                      className="vtoInput"
                      value={userInfo.weight}
                      onChange={(e) => setUserInfo({ ...userInfo, weight: e.target.value })}
                    />
                  </div>
                </div>

                <div className="vtoFormGroup" style={{ marginTop: "24px" }}>
                  <label className="vtoLabel">Fit preference</label>
                  <div className="vtoRangeContainer">
                    <div className="vtoRangeTrackBg">
                      <div className="vtoRangeDot" />
                      <div className="vtoRangeDot" />
                      <div className="vtoRangeDot" />
                      <div className="vtoRangeDot" />
                      <div className="vtoRangeDot" />
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      className="vtoRange"
                      value={userInfo.fit}
                      onChange={(e) => setUserInfo({ ...userInfo, fit: e.target.value })}
                    />
                    <div className="vtoRangeLabels">
                      <span>Tight</span>
                      <span>Standard</span>
                      <span>Loose</span>
                    </div>
                  </div>
                </div>

                <button type="button" className="vtoTrashBtn" onClick={handleDeleteData}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                  Delete your data
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Terms Modal */}
        {showTerms && (
          <div
            className="legalOverlay"
            onClick={() => setShowTerms(false)}
          >
            <div
              className="legalModal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="legalHeader">
                <h2>Terms of Service</h2>
                <button
                  type="button"
                  className="closeBtn"
                  onClick={() => setShowTerms(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="legalBody">
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
            className="legalOverlay"
            onClick={() => setShowPrivacy(false)}
          >
            <div
              className="legalModal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="legalHeader">
                <h2>Privacy Policy</h2>
                <button
                  type="button"
                  className="closeBtn"
                  onClick={() => setShowPrivacy(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="legalBody">
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
