import {
  Cloud,
  DatabaseBackup,
  Glasses,
  GraduationCap,
  Keyboard,
  Languages,
  LibraryBig,
  ScrollText,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";

export const settingsSections = [
  { value: "general", label: "settings_general", icon: SlidersHorizontal },
  { value: "reading", label: "settings_reading", icon: Glasses },
  { value: "dictionaries", label: "dictionaries", icon: LibraryBig },
  { value: "review", label: "review", icon: GraduationCap },
  { value: "controls", label: "settings_controls", icon: Keyboard },
  { value: "audio", label: "settings_audio", icon: Volume2 },
  { value: "translation", label: "translation", icon: Languages },
  { value: "sync", label: "sync_title", icon: Cloud },
  { value: "backups", label: "settings_backups", icon: DatabaseBackup },
  { value: "changelog", label: "changelog", icon: ScrollText },
] as const;
