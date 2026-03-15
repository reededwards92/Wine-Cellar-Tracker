import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import type { Stats } from "@/lib/api";

interface StatsBarProps {
  stats: Stats | undefined;
  isLoading: boolean;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function StatsBar({ stats, isLoading }: StatsBarProps) {
  if (isLoading || !stats) {
    return (
      <View style={styles.container}>
        <View style={[styles.card, styles.skeleton]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Stat label="Bottles" value={String(stats.total_bottles)} />
        <Divider />
        <Stat label="Value" value={`$${Math.round(stats.total_value).toLocaleString()}`} />
        <Divider />
        <Stat label="Wines" value={String(stats.unique_wines)} />
        <Divider />
        <Stat label="Consumed" value={String(stats.consumed_bottles)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  card: {
    flexDirection: "row",
    backgroundColor: Colors.light.cardBackground,
    borderRadius: theme.radius.xl,
    ...theme.shadows.elevated,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  skeleton: {
    height: 60,
    opacity: 0.5,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.light.divider,
  },
  value: {
    fontSize: 18,
    fontFamily: "Outfit_700Bold",
    color: Colors.light.text,
  },
  label: {
    fontSize: 11,
    fontFamily: "Outfit_300Light",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
});
