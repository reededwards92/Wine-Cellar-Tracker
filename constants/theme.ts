import type { TextStyle, ViewStyle } from "react-native";

// Font family constants — system fonts, zero bundle cost
export const fonts = {
  // Apple's system serif (iOS 13+). No loading required.
  serif: "New York",
  // SF Pro is the iOS system default — omit fontFamily to use it.
} as const;

type ShadowStyle = Pick<
  ViewStyle,
  "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius" | "elevation"
>;

type TypographyStyle = Pick<
  TextStyle,
  "fontFamily" | "fontSize" | "lineHeight" | "letterSpacing" | "textTransform" | "fontWeight"
>;

export const theme = {
  fonts,

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    "2xl": 24,
    "3xl": 32,
    "4xl": 40,
  },

  radius: {
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
    "2xl": 20,
    full: 9999,
  },

  shadows: {
    card: {
      shadowColor: "#1C1B1A",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    elevated: {
      shadowColor: "#1C1B1A",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.10,
      shadowRadius: 8,
      elevation: 3,
    },
    floating: {
      shadowColor: "#1C1B1A",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.16,
      shadowRadius: 10,
      elevation: 5,
    },
    glass: {
      shadowColor: "#1C1B1A",
      shadowOpacity: 0.07,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    },
  } satisfies Record<string, ShadowStyle>,

  typography: {
    display: {
      fontFamily: fonts.serif,
      fontWeight: "700",
      fontSize: 30,
      lineHeight: 38,
    },
    heading1: {
      fontFamily: fonts.serif,
      fontWeight: "700",
      fontSize: 22,
      lineHeight: 30,
    },
    heading2: {
      fontWeight: "600",
      fontSize: 17,
      lineHeight: 24,
    },
    heading3: {
      fontWeight: "600",
      fontSize: 15,
      lineHeight: 22,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
    },
    bodySmall: {
      fontSize: 14,
      lineHeight: 20,
    },
    label: {
      fontWeight: "500",
      fontSize: 13,
      lineHeight: 18,
    },
    caption: {
      fontSize: 12,
      lineHeight: 16,
    },
    overline: {
      fontWeight: "600",
      fontSize: 12,
      lineHeight: 16,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
    },
    button: {
      fontWeight: "600",
      fontSize: 16,
      lineHeight: 22,
    },
  } satisfies Record<string, TypographyStyle>,
} as const;

export type Theme = typeof theme;
