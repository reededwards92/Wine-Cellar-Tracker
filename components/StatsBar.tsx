import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import type { Stats } from "@/lib/api";

interface StatsBarProps {
  stats: Stats | undefined;
  isLoading: boolean;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export default function StatsBar({ stats, isLoading }: StatsBarProps) {
  if (isLoading || !stats) {
    return (
      <View style={styles.container}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.card, styles.skeleton]} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatCard label="Bottles" value={String(stats.total_bottles)} />
      <StatCard
        label="Value"
        value={`$${Math.round(stats.total_value).toLocaleString()}`}
      />
      <StatCard label="Wines" value={String(stats.unique_wines)} />
      <StatCard label="Consumed" value={String(stats.consumed_bottles)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: {
    flex: 1,
    backgroundColor: Colors.light.cardBackground,
    borderRadius: theme.radius.xl,
    ...theme.shadows.card,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  skeleton: {
    height: 56,
    opacity: 0.5,
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
