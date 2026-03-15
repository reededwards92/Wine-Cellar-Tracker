import type { TextStyle, ViewStyle } from "react-native";

// Font family constants
export const fonts = {
  outfit: {
    light: "Outfit_300Light",
    regular: "Outfit_400Regular",
    medium: "Outfit_500Medium",
    semiBold: "Outfit_600SemiBold",
    bold: "Outfit_700Bold",
  },
  libre: {
    regular: "LibreBaskerville_400Regular",
    bold: "LibreBaskerville_700Bold",
  },
} as const;

type ShadowStyle = Pick<
  ViewStyle,
  "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius" | "elevation"
>;

type TypographyStyle = Pick<
  TextStyle,
  "fontFamily" | "fontSize" | "lineHeight" | "letterSpacing" | "textTransform"
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
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 3,
      elevation: 1,
    },
    elevated: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 3,
    },
    floating: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 5,
    },
  } satisfies Record<string, ShadowStyle>,

  typography: {
    display: {
      fontFamily: fonts.libre.bold,
      fontSize: 30,
      lineHeight: 38,
    },
    heading1: {
      fontFamily: fonts.libre.bold,
      fontSize: 22,
      lineHeight: 30,
    },
    heading2: {
      fontFamily: fonts.outfit.semiBold,
      fontSize: 17,
      lineHeight: 24,
    },
    heading3: {
      fontFamily: fonts.outfit.semiBold,
      fontSize: 15,
      lineHeight: 22,
    },
    body: {
      fontFamily: fonts.outfit.regular,
      fontSize: 15,
      lineHeight: 22,
    },
    bodySmall: {
      fontFamily: fonts.outfit.regular,
      fontSize: 14,
      lineHeight: 20,
    },
    label: {
      fontFamily: fonts.outfit.medium,
      fontSize: 13,
      lineHeight: 18,
    },
    caption: {
      fontFamily: fonts.outfit.regular,
      fontSize: 12,
      lineHeight: 16,
    },
    overline: {
      fontFamily: fonts.outfit.semiBold,
      fontSize: 12,
      lineHeight: 16,
      textTransform: "uppercase" as const,
      letterSpacing: 0.5,
    },
    button: {
      fontFamily: fonts.outfit.semiBold,
      fontSize: 16,
      lineHeight: 22,
    },
  } satisfies Record<string, TypographyStyle>,
} as const;

export type Theme = typeof theme;
