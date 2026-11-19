import "@mantine/core/styles.css";
import "@mantine/carousel/styles.css";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root")!;

if (root.dataset.path === window.location.pathname) {
  hydrateRoot(root, <App />);
} else {
  createRoot(root).render(<App />);
}
