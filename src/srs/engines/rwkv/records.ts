import type { FeatureCard, FeatureGlobal } from "@/srs/engines/rwkv/features";
import type { Heads } from "@/srs/engines/rwkv/model";
import type { StoredLayers } from "@/srs/engines/rwkv/precision";

export type RwkvEntity = { id: string; state: StoredLayers };
export type RwkvCard = {
  id: string;
  features: FeatureCard;
  curve: Pick<Heads, "w" | "s" | "d">;
};
export type RwkvMeta = {
  id: string;
  key: string;
  cursor: number;
  features: FeatureGlobal;
};
