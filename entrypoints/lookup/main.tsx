import { Lookup } from "@/lookup/components/Lookup";
import "@mantine/core/styles.css";
import "@/shared/styles/content.css";
import { UIProvider } from "@/shared/ui/UIProvider";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <UIProvider scope="popups" popup>
    <Lookup />
  </UIProvider>,
);
