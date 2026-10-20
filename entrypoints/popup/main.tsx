import { Popup } from "@/app/pages/PopupPage";
import "@mantine/core/styles.css";
import "@/shared/styles/content.css";
import { UIProvider } from "@/shared/ui/UIProvider";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <UIProvider scope="extensionPages">
    <Popup />
  </UIProvider>,
);
