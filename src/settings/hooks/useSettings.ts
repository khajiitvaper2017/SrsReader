import { SettingsContext } from "@/shared/ui/UIProvider";
import { useContext } from "react";

export function useSettings() {
  return useContext(SettingsContext);
}
