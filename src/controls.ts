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
const noModifiers = { ctrl: false, alt: false, shift: false, meta: false };
export const lookupPresets: LookupBinding[] = [
  { type: "mouse", button: 1, ...noModifiers },
  { type: "hover", code: "", ...noModifiers, shift: true },
  { type: "mouse", button: 4, ...noModifiers },
  { type: "hover", code: "", ...noModifiers },
];
export function bindingLabel(binding: LookupBinding) {
  const keys = [
    binding.ctrl && "Ctrl",
    binding.alt && "Alt",
    binding.shift && "Shift",
    binding.meta && "Meta",
  ].filter(Boolean);
  if (binding.type === "mouse")
    keys.push(
      [
        "Left mouse",
        "Middle mouse",
        "Right mouse",
        "Mouse Back",
        "Mouse Forward",
      ][binding.button]!,
    );
  else if (binding.code)
    keys.push(
      binding.code.replace(/^(Key|Digit)/, "").replace(/^Arrow/, "Arrow "),
    );
  if (binding.type === "hover") keys.push("hover");
  return keys.join(" + ").replace(/^hover$/, "Hover");
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
