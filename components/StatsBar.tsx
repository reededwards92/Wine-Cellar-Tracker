import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
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
        <View style={[styles.cardOuter, styles.skeleton]} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BlurView intensity={35} tint="light" style={styles.cardOuter}>
        <View style={styles.cardInner}>
          <Stat label="Bottles" value={String(stats.total_bottles)} />
          <Divider />
          <Stat label="Value" value={`$${Math.round(stats.total_value).toLocaleString()}`} />
          <Divider />
          <Stat label="Wines" value={String(stats.unique_wines)} />
          <Divider />
          <Stat label="Consumed" value={String(stats.consumed_bottles)} />
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cardOuter: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: Colors.light.glassBorder,
    overflow: "hidden",
    ...theme.shadows.glass,
  },
  cardInner: {
    flexDirection: "row",
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  skeleton: {
    height: 60,
    opacity: 0.5,
    backgroundColor: Colors.light.glassBg,
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(114, 47, 55, 0.12)",
  },
  value: {
    fontSize: 18,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  label: {
    fontSize: 11,
    fontFamily: "Outfit_400Regular",
    color: "rgba(45, 18, 21, 0.55)",
    marginTop: 2,
  },
});
