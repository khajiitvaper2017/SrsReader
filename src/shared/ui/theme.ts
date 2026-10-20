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
  colorsTuple,
  darken,
  lighten,
  Fieldset,
  FileButton,
  Input,
  Menu,
  NativeSelect,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  Tabs,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";

import { t } from "@/shared/i18n/i18n";
import type { Settings } from "@/settings/model";

export function createUITheme(
  settings: Pick<Settings, "theme" | "accentColor">,
) {
  const oled = settings.theme === "oled";
  return createTheme({
    primaryColor: "accent",
    primaryShade: 6,
    autoContrast: true,
    colors: {
      accent: colorsTuple([
        ...[0.92, 0.82, 0.68, 0.5, 0.32, 0.16].map((amount) =>
          lighten(settings.accentColor, amount),
        ),
        settings.accentColor,
        ...[0.1, 0.2, 0.3].map((amount) =>
          darken(settings.accentColor, amount),
        ),
      ]),
      dark: [
        "#e8e8e8",
        "#dcdcdc",
        "#cccccc",
        "#b8b8b8",
        "#333333",
        oled ? "#121212" : "#242424",
        oled ? "#000000" : "#181818",
        oled ? "#000000" : "#101010",
        oled ? "#000000" : "#0a0a0a",
        oled ? "#000000" : "#050505",
      ],
    },
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
      InputWrapper: Input.Wrapper.extend({
        defaultProps: {
          inputWrapperOrder: ["label", "input", "description", "error"],
        },
      }),
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
      Tabs: Tabs.extend({
        defaultProps: { variant: "pills" },
        styles: {
          list: { flexWrap: "wrap" },
          tab: { fontSize: "var(--mantine-font-size-sm)", minHeight: 34 },
        },
      }),
      SegmentedControl: SegmentedControl.extend({
        defaultProps: { size: "xs", "data-srs-reader": true },
        styles: { label: { whiteSpace: "normal" } },
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
                scrollbarGutter: "stable",
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
              scrollbarGutter: "stable",
            },
          },
        },
      }),
    },
  });
}
