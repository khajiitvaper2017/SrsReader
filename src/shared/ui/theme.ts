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
  Group,
  Input,
  Kbd,
  Menu,
  NativeSelect,
  NumberInput,
  Paper,
  Radio,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
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
  popup = false,
) {
  const oled = settings.theme === "oled";
  const controlSize = popup ? "xs" : "md";
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
    fontSizes: popup
      ? { xs: "0.6875rem", sm: "0.8125rem", md: "0.875rem" }
      : { md: "0.875rem" },
    defaultRadius: "sm",
    radius: { xs: "0.1875rem", sm: "0.3125rem", md: "0.5rem" },
    ...(popup
      ? {
          headings: {
            sizes: {
              h1: { fontSize: "1.5rem" },
              h2: { fontSize: "1.125rem" },
              h3: { fontSize: "0.9375rem" },
            },
          },
        }
      : {}),
    components: {
      ...(popup
        ? {
            Stack: Stack.extend({ defaultProps: { gap: "xs" } }),
            Group: Group.extend({ defaultProps: { gap: "xs" } }),
            SimpleGrid: SimpleGrid.extend({ defaultProps: { spacing: "xs" } }),
          }
        : {}),
      Button: Button.extend({
        defaultProps: {
          size: controlSize,
          variant: "default",
          "data-srs-reader": true,
        },
        styles: {
          label: {
            gap: popup ? 6 : "var(--mantine-spacing-xs)",
            whiteSpace: "normal",
          },
          root: {
            height: "auto",
            minHeight: popup ? 30 : "var(--button-height)",
            paddingBlock: popup ? 5 : "var(--mantine-spacing-xs)",
          },
        },
      }),
      ActionIcon: ActionIcon.extend({
        defaultProps: {
          ...(popup ? { size: "sm" } : {}),
          variant: "subtle",
          color: "gray",
          "data-srs-reader": true,
        },
      }),
      Input: Input.extend({ defaultProps: { size: controlSize } }),
      InputWrapper: Input.Wrapper.extend({
        defaultProps: {
          size: controlSize,
          inputWrapperOrder: ["label", "input", "description", "error"],
        },
      }),
      TextInput: TextInput.extend({
        defaultProps: { size: controlSize, "data-srs-reader": true },
      }),
      NumberInput: NumberInput.extend({
        defaultProps: {
          size: controlSize,
          allowDecimal: false,
          "data-srs-reader": true,
        },
      }),
      Textarea: Textarea.extend({
        defaultProps: {
          size: controlSize,
          autosize: true,
          minRows: 3,
          "data-srs-reader": true,
        },
      }),
      Tabs: Tabs.extend({
        defaultProps: { variant: "pills" },
        styles: {
          list: { flexWrap: "wrap" },
          tab: {
            fontSize: popup
              ? "var(--mantine-font-size-sm)"
              : "var(--mantine-font-size-md)",
            ...(popup ? { minHeight: 34 } : {}),
          },
        },
      }),
      SegmentedControl: SegmentedControl.extend({
        defaultProps: { size: controlSize, "data-srs-reader": true },
        styles: { label: { whiteSpace: "normal" } },
      }),
      NavLink: NavLink.extend({
        defaultProps: { "data-srs-reader": true },
        styles: popup
          ? {}
          : {
              label: { fontSize: "var(--mantine-font-size-md)" },
              description: { fontSize: "var(--mantine-font-size-xs)" },
            },
      }),
      ComboboxDropdown: Combobox.Dropdown.extend({
        defaultProps: { "data-srs-reader": true },
      }),
      NativeSelect: NativeSelect.extend({
        defaultProps: { size: controlSize, "data-srs-reader": true },
      }),
      Select: Select.extend({
        defaultProps: {
          size: controlSize,
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
          size: controlSize,
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
          size: controlSize,
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
        defaultProps: { size: controlSize, "data-srs-reader": true },
      }),
      Radio: Radio.extend({
        defaultProps: { size: controlSize, "data-srs-reader": true },
      }),
      RadioGroup: Radio.Group.extend({
        defaultProps: { size: controlSize },
        styles: {
          description: { marginTop: "var(--mantine-spacing-md)" },
        },
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
      Badge: Badge.extend({
        defaultProps: {
          ...(popup ? { size: "sm" } : { size: "lg", fz: "xs" }),
          variant: "light",
        },
      }),
      Kbd: Kbd.extend({ defaultProps: { size: controlSize } }),
      Text: Text.extend({
        ...(popup ? { defaultProps: { size: "sm" } } : {}),
        styles: (theme, { variant }) => ({
          root:
            variant === "supporting"
              ? {
                  fontSize: theme.fontSizes.xs,
                  color: "var(--mantine-color-dimmed)",
                }
              : {},
        }),
      }),
      Title: Title.extend({ defaultProps: { order: 2 } }),
      Accordion: Accordion.extend({
        defaultProps: { variant: "default", chevronSize: 14 },
        styles: {
          control: { paddingInline: 0, paddingBlock: 8 },
          label: {
            padding: 0,
            ...(popup ? { fontSize: "var(--mantine-font-size-sm)" } : {}),
          },
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
