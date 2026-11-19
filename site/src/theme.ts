import {
  Button,
  Text,
  colorsTuple,
  createTheme,
  darken,
  lighten,
} from "@mantine/core";

// Use the extension's default accent, dark palette, and type scale.
const accent = "#D26400";

export const theme = createTheme({
  primaryColor: "accent",
  primaryShade: 8,
  autoContrast: true,
  colors: {
    accent: colorsTuple([
      ...[0.92, 0.82, 0.68, 0.5, 0.32, 0.16].map((amount) =>
        lighten(accent, amount),
      ),
      accent,
      ...[0.1, 0.2, 0.3].map((amount) => darken(accent, amount)),
    ]),
    dark: [
      "#e8e8e8",
      "#dcdcdc",
      "#cccccc",
      "#b8b8b8",
      "#333333",
      "#242424",
      "#181818",
      "#101010",
      "#0a0a0a",
      "#050505",
    ],
  },
  fontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSizes: { xs: "0.875rem", md: "1rem" },
  defaultRadius: "sm",
  radius: { xs: "0.1875rem", sm: "0.3125rem", md: "0.5rem" },
  headings: {
    sizes: {
      h1: { fontSize: "clamp(1.5rem, 5vw, 2.125rem)" },
      h2: { fontSize: "clamp(1.25rem, 4vw, 1.625rem)" },
      h3: { fontSize: "clamp(1.125rem, 3vw, 1.375rem)" },
    },
  },
  components: {
    Button: Button.extend({ defaultProps: { variant: "default", size: "md" } }),
    Text: Text.extend({
      styles: (theme, { variant }) => ({
        root:
          variant === "supporting"
            ? {
                fontSize: theme.fontSizes.xs,
                color:
                  "light-dark(var(--mantine-color-gray-7), var(--mantine-color-dimmed))",
              }
            : {},
      }),
    }),
  },
});
