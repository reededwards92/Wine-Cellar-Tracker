import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import { getColorDot } from "@/lib/api";
import type { InsightCard as InsightCardType } from "@/lib/api";

const ACCENT_COLORS: Record<InsightCardType["type"], string> = {
  ready_to_drink: Colors.light.success,
  drink_soon: Colors.light.warning,
};

interface Props {
  card: InsightCardType;
  onPress: () => void;
}

export default function InsightCard({ card, onPress }: Props) {
  const accent = ACCENT_COLORS[card.type];
  const displayWines = card.wines.slice(0, 3);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{card.title}</Text>
        <Text style={styles.subtitle} numberOfLines={2}>{card.subtitle}</Text>
        <View style={styles.wineRow}>
          {displayWines.map((w) => (
            <View key={w.id} style={styles.wineChip}>
              <View style={[styles.wineDot, { backgroundColor: getColorDot(w.color ?? null) }]} />
              <Text style={styles.wineText} numberOfLines={1}>{w.producer}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 210,
    height: 155,
    backgroundColor: Colors.light.cardBackground,
    borderRadius: theme.radius.lg,
    flexDirection: "row",
    overflow: "hidden",
    ...theme.shadows.card,
  },
  pressed: {
    opacity: 0.7,
  },
  accent: {
    width: 4,
  },
  body: {
    flex: 1,
    padding: 12,
    justifyContent: "space-between",
  },
  title: {
    ...theme.typography.heading3,
    color: Colors.light.text,
  },
  subtitle: {
    ...theme.typography.caption,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  wineRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  wineChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: 85,
  },
  wineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  wineText: {
    ...theme.typography.caption,
    color: Colors.light.textSecondary,
    flexShrink: 1,
  },
});
