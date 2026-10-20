import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  ColorInput,
  ColorPicker,
  Combobox,
  NavLink,
  createTheme,
  Fieldset,
  FileButton,
  Input,
  Menu,
  NativeSelect,
  NumberInput,
  Paper,
  Select,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";

import { t } from "@/shared/i18n/i18n";

export function createUITheme() {
  return createTheme({
    primaryColor: "violet",
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSizes: { xs: "0.6875rem", sm: "0.8125rem", md: "0.875rem" },
    defaultRadius: "sm",
    radius: { xs: "0.1875rem", sm: "0.3125rem", md: "0.5rem" },
    headings: {
      sizes: {
        h1: { fontSize: "1.5rem" },
        h2: { fontSize: "1.125rem" },
        h3: { fontSize: "0.9375rem" },
      },
    },
    components: {
      Button: Button.extend({
        defaultProps: {
          size: "xs",
          variant: "default",
          "data-srs-reader": true,
        },
        styles: {
          label: { gap: 6, whiteSpace: "normal" },
          root: { height: "auto", minHeight: 30, paddingBlock: 5 },
        },
      }),
      ActionIcon: ActionIcon.extend({
        defaultProps: {
          size: "sm",
          variant: "subtle",
          color: "gray",
          "data-srs-reader": true,
        },
      }),
      Input: Input.extend({ defaultProps: { size: "xs" } }),
      TextInput: TextInput.extend({
        defaultProps: { size: "xs", "data-srs-reader": true },
      }),
      NumberInput: NumberInput.extend({
        defaultProps: {
          size: "xs",
          allowDecimal: false,
          "data-srs-reader": true,
        },
      }),
      Textarea: Textarea.extend({
        defaultProps: {
          size: "xs",
          autosize: true,
          minRows: 3,
          "data-srs-reader": true,
        },
      }),
      NavLink: NavLink.extend({ defaultProps: { "data-srs-reader": true } }),
      ComboboxDropdown: Combobox.Dropdown.extend({
        defaultProps: { "data-srs-reader": true },
      }),
      NativeSelect: NativeSelect.extend({
        defaultProps: { size: "xs", "data-srs-reader": true },
      }),
      Select: Select.extend({
        defaultProps: {
          size: "xs",
          allowDeselect: false,
          maxDropdownHeight: 200,
          comboboxProps: {
            withinPortal: true,
            floatingStrategy: "fixed",
            middlewares: { flip: true, shift: { padding: 4 } },
          },
          "data-srs-reader": true,
        },
      }),
      ColorPicker: ColorPicker.extend({
        defaultProps: {
          "data-srs-reader": true,
          saturationLabel: t("color_saturation"),
          hueLabel: t("color_hue"),
          alphaLabel: t("color_opacity"),
        },
      }),
      ColorInput: ColorInput.extend({
        defaultProps: {
          size: "xs",
          format: "hex",
          disallowInput: true,
          withEyeDropper: false,
          "data-srs-reader": true,
          popoverProps: {
            withinPortal: true,
            styles: {
              dropdown: {
                maxWidth: "calc(100vw - 8px)",
                maxHeight: "calc(100dvh - 8px)",
                overflowY: "auto",
              },
            },
            middlewares: { flip: true, shift: { padding: 4 } },
          },
        },
      }),
      Switch: Switch.extend({
        defaultProps: {
          size: "xs",
          labelPosition: "left",
          w: "100%",
          "data-srs-reader": true,
        },
        styles: {
          body: { justifyContent: "space-between", alignItems: "center" },
          labelWrapper: { flex: 1, minWidth: 0 },
        },
      }),
      Checkbox: Checkbox.extend({
        defaultProps: { size: "xs", "data-srs-reader": true },
      }),
      Paper: Paper.extend({ defaultProps: { withBorder: true, p: "md" } }),
      FileButton: FileButton.extend({
        defaultProps: {
          inputProps: {
            onClick: (event) => {
              event.currentTarget.value = "";
            },
          },
        },
      }),
      Fieldset: Fieldset.extend({ defaultProps: { p: "sm" } }),
      Badge: Badge.extend({ defaultProps: { size: "sm", variant: "light" } }),
      Text: Text.extend({ defaultProps: { size: "sm" } }),
      Title: Title.extend({ defaultProps: { order: 2 } }),
      Accordion: Accordion.extend({
        defaultProps: { variant: "default", chevronSize: 14 },
        styles: {
          control: { paddingInline: 0, paddingBlock: 8 },
          label: { padding: 0, fontSize: "var(--mantine-font-size-sm)" },
          content: { paddingInline: 0 },
        },
      }),
      Menu: Menu.extend({
        defaultProps: {
          withinPortal: true,
          position: "bottom-end",
          floatingStrategy: "fixed",
          middlewares: { flip: true, shift: { padding: 4 } },
          shadow: "sm",
        },
      }),
      MenuDropdown: Menu.Dropdown.extend({
        defaultProps: {
          "data-srs-reader": true,
          styles: {
            dropdown: {
              maxWidth: "calc(100vw - 8px)",
              maxHeight: "calc(100dvh - 8px)",
              overflowY: "auto",
            },
          },
        },
      }),
    },
  });
}
