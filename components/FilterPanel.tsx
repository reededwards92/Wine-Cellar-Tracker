import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Switch, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
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
  wineIds: number[];
}

interface FilterPanelProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  options: FilterOptions | undefined;
  isExpanded: boolean;
  onToggle: () => void;
  defaultOpenSection?: string | null;
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

function AccordionSection({
  label,
  count,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.accordionSection}>
      <Pressable style={styles.accordionHeader} onPress={onToggle}>
        <Text style={styles.accordionLabel}>{label}</Text>
        <View style={styles.accordionRight}>
          {count > 0 && !expanded && (
            <View style={styles.accordionBadge}>
              <Text style={styles.accordionBadgeText}>{count}</Text>
            </View>
          )}
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color="rgba(114, 47, 55, 0.45)"
          />
        </View>
      </Pressable>
      {expanded && <View style={styles.accordionBody}>{children}</View>}
    </View>
  );
}

export default function FilterPanel({ filters, onChange, options, isExpanded, onToggle, defaultOpenSection }: FilterPanelProps) {
  const [openSection, setOpenSection] = useState<string | null>(defaultOpenSection ?? null);

  React.useEffect(() => {
    if (defaultOpenSection !== undefined) setOpenSection(defaultOpenSection ?? null);
  }, [defaultOpenSection]);

  const toggleSection = (key: string) =>
    setOpenSection((prev) => (prev === key ? null : key));

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
    (!filters.inStock ? 1 : 0) +
    (filters.wineIds?.length > 0 ? 1 : 0);

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={onToggle}>
        <View style={styles.headerLeft}>
          <Ionicons name="options-outline" size={18} color="rgba(45, 18, 21, 0.65)" />
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
          color="rgba(45, 18, 21, 0.65)"
        />
      </Pressable>

      {isExpanded ? (
        <View style={styles.body}>
          <AccordionSection
            label="Color"
            count={filters.colors.length}
            expanded={openSection === "color"}
            onToggle={() => toggleSection("color")}
          >
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
          </AccordionSection>

          <AccordionSection
            label="Drink Window"
            count={filters.drinkWindow.length}
            expanded={openSection === "dw"}
            onToggle={() => toggleSection("dw")}
          >
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
          </AccordionSection>

          {locationOptions.length > 0 && (
            <AccordionSection
              label="Location"
              count={filters.locations.length}
              expanded={openSection === "location"}
              onToggle={() => toggleSection("location")}
            >
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
            </AccordionSection>
          )}

          <AccordionSection
            label="Value Range"
            count={(filters.minValue ? 1 : 0) + (filters.maxValue ? 1 : 0)}
            expanded={openSection === "value"}
            onToggle={() => toggleSection("value")}
          >
            <View style={styles.rangeRow}>
              <TextInput
                style={styles.rangeInput}
                placeholder="Min"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
                value={filters.minValue}
                onChangeText={(v) => onChange({ ...filters, minValue: v })}
                keyboardType="numeric"
              />
              <Text style={styles.rangeSep}>–</Text>
              <TextInput
                style={styles.rangeInput}
                placeholder="Max"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
                value={filters.maxValue}
                onChangeText={(v) => onChange({ ...filters, maxValue: v })}
                keyboardType="numeric"
              />
            </View>
          </AccordionSection>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>In stock only</Text>
            <Switch
              value={filters.inStock}
              onValueChange={(v) => onChange({ ...filters, inStock: v })}
              trackColor={{ true: Colors.light.tint }}
            />
          </View>

          <AccordionSection
            label="Sort by"
            count={0}
            expanded={openSection === "sort"}
            onToggle={() => toggleSection("sort")}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {SORT_OPTIONS.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.chip, styles.sortChip, filters.sort === o.value && styles.chipActive]}
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
          </AccordionSection>

          {activeCount > 0 ? (
            <Pressable
              style={styles.clearBtn}
              onPress={() => onChange({
                colors: [], region: "", country: "", varietal: "",
                drinkWindow: [], locations: [], minValue: "", maxValue: "", inStock: true,
                search: filters.search, sort: "producer", order: "asc", wineIds: [],
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
    backgroundColor: "transparent",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(114, 47, 55, 0.08)",
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
    color: "rgba(45, 18, 21, 0.65)",
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
    paddingBottom: 8,
  },
  accordionSection: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(114, 47, 55, 0.06)",
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  accordionLabel: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  accordionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  accordionBadge: {
    backgroundColor: "rgba(114, 47, 55, 0.12)",
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  accordionBadgeText: {
    fontSize: 11,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.tint,
  },
  accordionBody: {
    paddingBottom: 10,
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
    borderColor: "rgba(114, 47, 55, 0.20)",
    backgroundColor: "rgba(255, 255, 255, 0.55)",
  },
  sortChip: {
    marginRight: 6,
  },
  chipActive: {
    backgroundColor: "rgba(114, 47, 55, 0.15)",
    borderColor: "rgba(114, 47, 55, 0.45)",
  },
  chipText: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: "rgba(45, 18, 21, 0.70)",
  },
  chipTextActive: {
    color: "#722F37",
  },
  rangeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rangeInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(114, 47, 55, 0.18)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: "rgba(255, 255, 255, 0.60)",
  },
  rangeSep: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(114, 47, 55, 0.06)",
  },
  switchLabel: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  clearBtn: {
    marginTop: 8,
    alignItems: "center",
  },
  clearText: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
});
