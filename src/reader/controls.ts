import { t } from "@/shared/i18n/i18n";
import { z } from "zod";

const modifiers = {
  ctrl: z.boolean(),
  alt: z.boolean(),
  shift: z.boolean(),
  meta: z.boolean(),
};
export const lookupBindingSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mouse"),
    button: z.number().int().min(0).max(4),
    ...modifiers,
  }),
  z.object({ type: z.literal("key"), code: z.string().min(1), ...modifiers }),
  z.object({ type: z.literal("hover"), code: z.string(), ...modifiers }),
]);
export type LookupBinding = z.infer<typeof lookupBindingSchema>;
export const readerKeysSchema = z.object({
  type: z.literal("srs-reader-keys"),
  session: z.string(),
  keys: z.array(z.string().max(64)).max(256),
  code: z.string().max(64),
  pressed: z.boolean(),
  ctrlKey: z.boolean(),
  altKey: z.boolean(),
  shiftKey: z.boolean(),
  metaKey: z.boolean(),
});
export const inputPreventionSchema = z
  .object({
    textHover: z.boolean(),
    webpages: z.boolean(),
    popups: z.boolean(),
    extensionPages: z.boolean(),
    searchFields: z.boolean(),
  })
  .default({
    textHover: false,
    webpages: true,
    popups: true,
    extensionPages: true,
    searchFields: true,
  });
const noModifiers = { ctrl: false, alt: false, shift: false, meta: false };
export const lookupPresets: LookupBinding[] = [
  { type: "mouse", button: 1, ...noModifiers },
  { type: "hover", code: "", ...noModifiers, shift: true },
  { type: "mouse", button: 4, ...noModifiers },
  { type: "hover", code: "", ...noModifiers },
];
export function bindingLabel(binding: LookupBinding) {
  const keys = [
    binding.ctrl && t("ctrl"),
    binding.alt && t("key_alt"),
    binding.shift && t("key_shift"),
    binding.meta && t("key_meta"),
  ].filter(Boolean);
  if (binding.type === "mouse")
    keys.push(
      [
        t("left_mouse"),
        t("middle_mouse"),
        t("right_mouse"),
        t("mouse_back"),
        t("mouse_forward"),
      ][binding.button]!,
    );
  else if (binding.code) {
    const keyNames: Record<string, string> = {
      Space: t("space"),
      Enter: t("key_enter"),
      NumpadEnter: t("key_numpad_enter"),
      Backspace: t("key_backspace"),
      Delete: t("key_delete"),
      Home: t("key_home"),
      End: t("key_end"),
      PageUp: t("key_page_up"),
      PageDown: t("key_page_down"),
      ArrowUp: t("key_arrow_up"),
      ArrowDown: t("key_arrow_down"),
      ArrowLeft: t("key_arrow_left"),
      ArrowRight: t("key_arrow_right"),
    };
    keys.push(
      keyNames[binding.code] ||
        (/^Numpad[0-9]$/.test(binding.code)
          ? t("key_numpad_digit", { digit: binding.code.slice(-1) })
          : binding.code.replace(/^(Key|Digit)/, "")),
    );
  }
  if (binding.type === "hover") keys.push(t("hover"));
  return keys.join(" + ");
}
export const bindingKey = (binding: LookupBinding) =>
  JSON.stringify([
    binding.type,
    binding.type === "mouse" ? binding.button : binding.code,
    binding.ctrl,
    binding.alt,
    binding.shift,
    binding.meta,
  ]);
export function matchesModifiers(
  binding: LookupBinding,
  event: Pick<MouseEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">,
) {
  return (
    binding.ctrl === event.ctrlKey &&
    binding.alt === event.altKey &&
    binding.shift === event.shiftKey &&
    binding.meta === event.metaKey
  );
}
