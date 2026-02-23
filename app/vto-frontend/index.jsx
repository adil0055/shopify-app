import { createRoot } from "react-dom/client";
import PublicVto from "./components/PublicVto.jsx";

const rootElement = document.getElementById("vto-root");
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<PublicVto />);
}
