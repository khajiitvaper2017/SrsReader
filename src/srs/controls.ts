import {
  bindingKey,
  lookupBindingSchema,
  matchesModifiers,
} from "@/reader/controls";
import { t } from "@/shared/i18n/i18n";
import { z } from "zod";

export const reviewActions = [
  "again",
  "hard",
  "good",
  "easy",
  "flip",
  "undo",
  "pause_timer",
] as const;
export type ReviewAction = (typeof reviewActions)[number];
const shortcutSchema = z.union([
  lookupBindingSchema.options[0],
  lookupBindingSchema.options[1],
]);
export type ReviewBinding = z.infer<typeof shortcutSchema>;
export function reviewBindingKey(binding: ReviewBinding) {
  return bindingKey(
    binding.type === "key"
      ? { ...binding, code: binding.code.replace(/^Numpad([0-9])$/, "Digit$1") }
      : binding,
  );
}
const key = (code: string): ReviewBinding => ({
  type: "key",
  code,
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
});
export const reviewBindingsSchema = z
  .object({
    again: shortcutSchema.nullable(),
    hard: shortcutSchema.nullable(),
    good: shortcutSchema.nullable(),
    easy: shortcutSchema.nullable(),
    flip: shortcutSchema.nullable(),
    undo: shortcutSchema.nullable(),
    pause_timer: shortcutSchema.nullable().default(null),
  })
  .refine(
    (bindings) => {
      const keys = Object.values(bindings)
        .filter((binding) => binding !== null)
        .map(reviewBindingKey);
      return new Set(keys).size === keys.length;
    },
    { error: () => t("review_binding_conflict") },
  )
  .default({
    again: key("Digit1"),
    hard: key("Digit2"),
    good: key("Digit3"),
    easy: key("Digit4"),
    flip: key("Space"),
    undo: key("KeyZ"),
    pause_timer: null,
  });

export function matchesReviewBinding(
  binding: ReviewBinding | null,
  event: KeyboardEvent | MouseEvent,
) {
  if (!binding || !matchesModifiers(binding, event)) return false;
  return binding.type === "mouse"
    ? "button" in event && binding.button === event.button
    : "code" in event &&
        binding.code.replace(/^Numpad([0-9])$/, "Digit$1") ===
          event.code.replace(/^Numpad([0-9])$/, "Digit$1");
}
