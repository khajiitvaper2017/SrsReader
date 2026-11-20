import type { CardAsset } from "@/cards/model";
import type { Settings } from "@/settings/model";

export type CardGesture = "reveal" | "again" | "good";

export type CardStorageState = {
  local: Record<string, string>;
  session: Record<string, string>;
};

export type CardFrameMessage = {
  channel: "srs-card-render";
  cardId: string;
  renderId: number;
  ordinal: number;
  html: string;
  css: string;
  assets: CardAsset[];
  dark: boolean;
  language: string;
  scan: boolean;
  selectionLimit?: number;
  gesture?: "front" | "back";
  theme: string;
  hideSources: boolean;
  showPartOfSpeech: boolean;
  autoplay: boolean;
  audioLabel: string;
  videoLabel: string;
  title: string;
  storage: CardStorageState;
  resourceError: string;
  reviewBindings: Settings["reviewBindings"];
};

export type RuntimeConfig = {
  urls: Record<string, string>;
  language: string;
  scan: boolean;
  selectionLimit?: number;
  answers: Record<string, string>;
  autoplay: boolean;
  storage: CardStorageState;
  resourceError: string;
};
