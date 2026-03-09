import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Switch, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { FilterOptions } from "@/lib/api";

export interface FilterState {
  colors: string[];
  region: string;
  country: string;
  varietal: string;
  drinkWindow: string[];
  locations: string[];
  minValue: string;
  maxValue: string;
  inStock: boolean;
  search: string;
  sort: string;
  order: string;
}

interface FilterPanelProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  options: FilterOptions | undefined;
  isExpanded: boolean;
  onToggle: () => void;
}

const WINE_COLORS = ["Red", "White", "Rosé", "Sparkling", "Dessert", "Fortified"];
const DW_OPTIONS = [
  { value: "in_window", label: "In window" },
  { value: "approaching", label: "Approaching" },
  { value: "past_peak", label: "Past peak" },
  { value: "not_set", label: "Not set" },
];
const SORT_OPTIONS = [
  { value: "producer", label: "Producer" },
  { value: "vintage", label: "Vintage" },
  { value: "value", label: "Value" },
  { value: "drink_window_start", label: "Drink Window" },
  { value: "quantity", label: "Quantity" },
  { value: "color", label: "Color" },
  { value: "region", label: "Region" },
  { value: "community_score", label: "Score" },
];

export default function FilterPanel({ filters, onChange, options, isExpanded, onToggle }: FilterPanelProps) {
  const toggleColor = (c: string) => {
    const next = filters.colors.includes(c)
      ? filters.colors.filter((x) => x !== c)
      : [...filters.colors, c];
    onChange({ ...filters, colors: next });
  };

  const toggleDW = (v: string) => {
    const next = filters.drinkWindow.includes(v)
      ? filters.drinkWindow.filter((x) => x !== v)
      : [...filters.drinkWindow, v];
    onChange({ ...filters, drinkWindow: next });
  };

  const toggleLocation = (v: string) => {
    const next = filters.locations.includes(v)
      ? filters.locations.filter((x) => x !== v)
      : [...filters.locations, v];
    onChange({ ...filters, locations: next });
  };

  const locationOptions = options?.locations || [];

  const activeCount =
    filters.colors.length +
    (filters.region ? 1 : 0) +
    (filters.country ? 1 : 0) +
    (filters.varietal ? 1 : 0) +
    filters.drinkWindow.length +
    filters.locations.length +
    (filters.minValue ? 1 : 0) +
    (filters.maxValue ? 1 : 0) +
    (!filters.inStock ? 1 : 0);

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={onToggle}>
        <View style={styles.headerLeft}>
          <Ionicons name="options-outline" size={18} color={Colors.light.textSecondary} />
          <Text style={styles.headerText}>Filters</Text>
          {activeCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeCount}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={Colors.light.textSecondary}
        />
      </Pressable>

      {isExpanded ? (
        <View style={styles.body}>
          <Text style={styles.sectionLabel}>Color</Text>
          <View style={styles.chipRow}>
            {WINE_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[styles.chip, filters.colors.includes(c) && styles.chipActive]}
                onPress={() => toggleColor(c)}
              >
                <Text style={[styles.chipText, filters.colors.includes(c) && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Drink Window</Text>
          <View style={styles.chipRow}>
            {DW_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                style={[styles.chip, filters.drinkWindow.includes(o.value) && styles.chipActive]}
                onPress={() => toggleDW(o.value)}
              >
                <Text style={[styles.chipText, filters.drinkWindow.includes(o.value) && styles.chipTextActive]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>

          {locationOptions.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>Location</Text>
              <View style={styles.chipRow}>
                {locationOptions.map((loc) => (
                  <Pressable
                    key={loc}
                    style={[styles.chip, filters.locations.includes(loc) && styles.chipActive]}
                    onPress={() => toggleLocation(loc)}
                  >
                    <Text style={[styles.chipText, filters.locations.includes(loc) && styles.chipTextActive]}>{loc}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.sectionLabel}>Value Range</Text>
          <View style={styles.rangeRow}>
            <TextInput
              style={styles.rangeInput}
              placeholder="Min"
              placeholderTextColor={Colors.light.tabIconDefault}
              value={filters.minValue}
              onChangeText={(v) => onChange({ ...filters, minValue: v })}
              keyboardType="numeric"
            />
            <Text style={styles.rangeSep}>–</Text>
            <TextInput
              style={styles.rangeInput}
              placeholder="Max"
              placeholderTextColor={Colors.light.tabIconDefault}
              value={filters.maxValue}
              onChangeText={(v) => onChange({ ...filters, maxValue: v })}
              keyboardType="numeric"
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>In stock only</Text>
            <Switch
              value={filters.inStock}
              onValueChange={(v) => onChange({ ...filters, inStock: v })}
              trackColor={{ true: Colors.light.tint }}
            />
          </View>

          <Text style={styles.sectionLabel}>Sort by</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll}>
            {SORT_OPTIONS.map((o) => (
              <Pressable
                key={o.value}
                style={[styles.chip, filters.sort === o.value && styles.chipActive]}
                onPress={() => {
                  if (filters.sort === o.value) {
                    onChange({ ...filters, order: filters.order === "asc" ? "desc" : "asc" });
                  } else {
                    onChange({ ...filters, sort: o.value, order: "asc" });
                  }
                }}
              >
                <Text style={[styles.chipText, filters.sort === o.value && styles.chipTextActive]}>
                  {o.label}
                  {filters.sort === o.value ? (filters.order === "asc" ? " ↑" : " ↓") : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {activeCount > 0 ? (
            <Pressable
              style={styles.clearBtn}
              onPress={() => onChange({
                colors: [], region: "", country: "", varietal: "",
                drinkWindow: [], locations: [], minValue: "", maxValue: "", inStock: true,
                search: filters.search, sort: "producer", order: "asc",
              })}
            >
              <Text style={styles.clearText}>Clear all filters</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerText: {
    fontSize: 14,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.textSecondary,
  },
  badge: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Outfit_600SemiBold",
    color: "#fff",
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.textSecondary,
    marginTop: 12,
    marginBottom: 6,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.cardBackground,
  },
  chipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
  },
  chipTextActive: {
    color: "#fff",
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rangeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.cardBackground,
  },
  rangeSep: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  switchLabel: {
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
  },
  sortScroll: {
    marginBottom: 4,
  },
  clearBtn: {
    marginTop: 12,
    alignItems: "center",
  },
  clearText: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
});
