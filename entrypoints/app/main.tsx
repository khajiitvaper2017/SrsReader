import { App } from "@/app/App";
import "@mantine/core/styles.css";
import "@/shared/styles/content.css";
import { UIProvider } from "@/shared/ui/UIProvider";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <UIProvider scope="extensionPages">
    <App />
  </UIProvider>,
);
