import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getDrinkWindowStatus, getColorDot } from "@/lib/api";
import type { WineListItem } from "@/lib/api";

interface WineCardProps {
  wine: WineListItem;
  onPress: () => void;
  onLongPress?: () => void;
  selectable?: boolean;
  selected?: boolean;
}

export default function WineCard({ wine, onPress, onLongPress, selectable, selected }: WineCardProps) {
  const dwStatus = getDrinkWindowStatus(wine.drink_window_start, wine.drink_window_end);

  const dwColor =
    dwStatus === "in_window" ? Colors.light.success :
    dwStatus === "approaching" ? Colors.light.warning :
    dwStatus === "past_peak" ? Colors.light.danger :
    Colors.light.tabIconDefault;

  const dwLabel =
    dwStatus === "in_window" ? "In window" :
    dwStatus === "approaching" ? "Approaching" :
    dwStatus === "past_peak" ? "Past peak" :
    "";

  const location = wine.sub_region || wine.appellation || wine.region || "";

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed, selected && styles.selectedContainer]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
    >
      <View style={styles.row}>
        {selectable ? (
          <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
            {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </View>
        ) : (
          <View style={[styles.colorDot, { backgroundColor: getColorDot(wine.color) }]} />
        )}
        <View style={styles.content}>
          <Text style={styles.producer} numberOfLines={1}>{wine.producer}</Text>
          <Text style={styles.wineName} numberOfLines={1}>
            {wine.wine_name}
            {wine.vintage ? ` ${wine.vintage}` : ""}
          </Text>
          <View style={styles.metaRow}>
            {location ? (
              <Text style={styles.meta} numberOfLines={1}>{location}</Text>
            ) : null}
            {wine.varietal ? (
              <Text style={styles.metaSep}>{location ? " · " : ""}{wine.varietal}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.right}>
          <View style={styles.quantityBadge}>
            <Text style={styles.quantityText}>{wine.bottle_count}</Text>
          </View>
          {wine.avg_value > 0 ? (
            <Text style={styles.value}>${Math.round(wine.avg_value)}</Text>
          ) : null}
          {wine.ct_community_score ? (
            <Text style={styles.score}>{Math.round(wine.ct_community_score)}</Text>
          ) : null}
        </View>
      </View>
      {(wine.drink_window_start || wine.drink_window_end) ? (
        <View style={styles.footer}>
          <View style={[styles.dwDot, { backgroundColor: dwColor }]} />
          <Text style={[styles.dwText, { color: dwColor }]}>
            {wine.drink_window_start && wine.drink_window_end
              ? `${wine.drink_window_start}–${wine.drink_window_end}`
              : wine.drink_window_start
                ? `From ${wine.drink_window_start}`
                : `Until ${wine.drink_window_end}`}
          </Text>
          {dwLabel ? (
            <Text style={[styles.dwLabel, { color: dwColor }]}> · {dwLabel}</Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(94, 38, 38, 0.08)",
    paddingLeft: 16,
    paddingRight: 32,
    paddingVertical: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  selectedContainer: {
    backgroundColor: Colors.light.tint + "08",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(94, 38, 38, 0.25)",
    marginTop: 3,
    marginRight: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkboxSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
    marginRight: 10,
  },
  content: {
    flex: 1,
  },
  producer: {
    fontSize: 14,
    fontFamily: "New York",
    color: Colors.light.text,
  },
  wineName: {
    fontSize: 13,
    fontFamily: "New York",
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 3,
    flexWrap: "wrap",
  },
  meta: {
    fontSize: 12,
    fontWeight: "300",
    color: Colors.light.textSecondary,
  },
  metaSep: {
    fontSize: 12,
    fontWeight: "300",
    color: Colors.light.textSecondary,
  },
  right: {
    alignItems: "flex-end",
    marginLeft: 12,
    gap: 2,
  },
  quantityBadge: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  quantityText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  value: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.light.text,
  },
  score: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.light.textSecondary,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginLeft: 20,
  },
  dwDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },
  dwText: {
    fontSize: 12,
    fontWeight: "300",
  },
  dwLabel: {
    fontSize: 12,
  },
});
