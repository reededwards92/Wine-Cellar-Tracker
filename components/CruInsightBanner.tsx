import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";

interface Props {
  insight: string | null;
  isLoading: boolean;
}

export default function CruInsightBanner({ insight, isLoading }: Props) {
  if (!isLoading && !insight) return null;

  return (
    <View style={styles.container}>
      <View style={styles.accent} />
      <View style={styles.body}>
        <Text style={styles.label}>{"\u2726"} Cru</Text>
        {isLoading ? (
          <View style={styles.skeletonRow}>
            <View style={[styles.skeletonLine, { width: "90%" }]} />
            <View style={[styles.skeletonLine, { width: "60%", marginTop: 6 }]} />
          </View>
        ) : (
          <Text style={styles.text}>{insight}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: Colors.light.cardBackground,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    ...theme.shadows.card,
  },
  accent: {
    width: 2,
    backgroundColor: Colors.light.tint,
  },
  body: {
    flex: 1,
    padding: 12,
  },
  label: {
    fontFamily: theme.fonts.outfit.semiBold,
    fontSize: 11,
    color: Colors.light.tint,
    marginBottom: 4,
  },
  text: {
    ...theme.typography.bodySmall,
    color: Colors.light.textSecondary,
  },
  skeletonRow: {
    gap: 0,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 4,
    backgroundColor: Colors.light.divider,
  },
});
