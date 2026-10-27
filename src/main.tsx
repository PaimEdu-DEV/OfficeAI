import { createRoot } from "react-dom/client";
import App from "./ui/App";
import "@fontsource/pixelify-sans/latin-400.css";
import "@fontsource/pixelify-sans/latin-500.css";
import "@fontsource/pixelify-sans/latin-600.css";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/space-grotesk/latin-400.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-600.css";
import "@fontsource/space-grotesk/latin-700.css";

createRoot(document.getElementById("root")!).render(<App />);
