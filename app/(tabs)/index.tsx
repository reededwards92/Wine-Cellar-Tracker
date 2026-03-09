import React, { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TextInput,
  Platform,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  PanResponder,
  LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import StatsBar from "@/components/StatsBar";
import WineCard from "@/components/WineCard";
import FilterPanel, { type FilterState } from "@/components/FilterPanel";
import type { WineListItem, Stats, FilterOptions } from "@/lib/api";

const DEFAULT_FILTERS: FilterState = {
  colors: [],
  region: "",
  country: "",
  varietal: "",
  drinkWindow: [],
  minValue: "",
  maxValue: "",
  inStock: true,
  search: "",
  sort: "producer",
  order: "asc",
};

interface Section {
  title: string;
  shortLabel: string;
  data: WineListItem[];
}

function getSectionKey(wine: WineListItem, sortField: string): { title: string; shortLabel: string } {
  switch (sortField) {
    case "producer": {
      const letter = (wine.producer || "?")[0].toUpperCase();
      return { title: letter, shortLabel: letter };
    }
    case "color": {
      const c = wine.color || "Unknown";
      return { title: c, shortLabel: c.slice(0, 3) };
    }
    case "region": {
      const r = wine.region || "Unknown";
      const short = r.length > 6 ? r.slice(0, 5) + "." : r;
      return { title: r, shortLabel: short };
    }
    case "vintage": {
      const v = wine.vintage ? String(wine.vintage) : "N/A";
      return { title: v, shortLabel: v.slice(-2) || v };
    }
    case "value": {
      const val = wine.avg_value || 0;
      if (val <= 25) return { title: "$0 – $25", shortLabel: "<25" };
      if (val <= 50) return { title: "$25 – $50", shortLabel: "<50" };
      if (val <= 100) return { title: "$50 – $100", shortLabel: "<100" };
      if (val <= 200) return { title: "$100 – $200", shortLabel: "<200" };
      return { title: "$200+", shortLabel: "200+" };
    }
    case "quantity": {
      const q = wine.bottle_count || 0;
      if (q <= 1) return { title: "1 Bottle", shortLabel: "1" };
      if (q <= 3) return { title: "2 – 3 Bottles", shortLabel: "2-3" };
      if (q <= 6) return { title: "4 – 6 Bottles", shortLabel: "4-6" };
      return { title: "7+ Bottles", shortLabel: "7+" };
    }
    case "community_score":
    case "score": {
      const s = wine.ct_community_score || 0;
      if (s === 0) return { title: "Unrated", shortLabel: "N/A" };
      if (s < 85) return { title: "Under 85", shortLabel: "<85" };
      if (s < 90) return { title: "85 – 89", shortLabel: "85" };
      if (s < 95) return { title: "90 – 94", shortLabel: "90" };
      return { title: "95+", shortLabel: "95+" };
    }
    case "drink_window_start":
    case "drinkWindow": {
      const now = new Date().getFullYear();
      const start = wine.drink_window_start;
      const end = wine.drink_window_end;
      if (!start && !end) return { title: "No Window", shortLabel: "N/A" };
      if (end && end < now) return { title: "Past Peak", shortLabel: "Past" };
      if (start && start > now) return { title: "Too Early", shortLabel: "Wait" };
      return { title: "In Window", shortLabel: "Now" };
    }
    default: {
      const letter = (wine.producer || "?")[0].toUpperCase();
      return { title: letter, shortLabel: letter };
    }
  }
}

function groupWinesIntoSections(wines: WineListItem[], sortField: string): Section[] {
  const sectionMap = new Map<string, Section>();
  const order: string[] = [];

  for (const wine of wines) {
    const { title, shortLabel } = getSectionKey(wine, sortField);
    if (!sectionMap.has(title)) {
      sectionMap.set(title, { title, shortLabel, data: [] });
      order.push(title);
    }
    sectionMap.get(title)!.data.push(wine);
  }

  return order.map((key) => sectionMap.get(key)!);
}

function SectionScrubber({
  sections,
  onSectionPress,
}: {
  sections: Section[];
  onSectionPress: (index: number) => void;
}) {
  const containerRef = useRef<View>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setContainerHeight(e.nativeEvent.layout.height);
  }, []);

  const getIndexFromY = useCallback(
    (y: number) => {
      if (sections.length === 0 || containerHeight === 0) return -1;
      const itemHeight = containerHeight / sections.length;
      const idx = Math.floor(y / itemHeight);
      return Math.max(0, Math.min(idx, sections.length - 1));
    },
    [sections.length, containerHeight]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const y = evt.nativeEvent.locationY;
          const idx = getIndexFromY(y);
          if (idx >= 0) onSectionPress(idx);
        },
        onPanResponderMove: (evt) => {
          const y = evt.nativeEvent.locationY;
          const idx = getIndexFromY(y);
          if (idx >= 0) onSectionPress(idx);
        },
      }),
    [getIndexFromY, onSectionPress]
  );

  if (sections.length <= 1) return null;

  return (
    <View
      ref={containerRef}
      style={styles.scrubberContainer}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      {sections.map((section, i) => (
        <Pressable
          key={section.title}
          style={styles.scrubberItem}
          onPress={() => onSectionPress(i)}
        >
          <Text style={styles.scrubberText}>{section.shortLabel}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function CellarScreen() {
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [searchText, setSearchText] = useState("");
  const isWeb = Platform.OS === "web";
  const sectionListRef = useRef<SectionList>(null);

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    params.set("sort", filters.sort);
    params.set("order", filters.order);
    params.set("inStock", String(filters.inStock));
    if (filters.colors.length > 0) params.set("color", filters.colors.join(","));
    if (filters.region) params.set("region", filters.region);
    if (filters.country) params.set("country", filters.country);
    if (filters.varietal) params.set("varietal", filters.varietal);
    if (filters.drinkWindow.length > 0) params.set("drinkWindow", filters.drinkWindow.join(","));
    if (filters.minValue) params.set("minValue", filters.minValue);
    if (filters.maxValue) params.set("maxValue", filters.maxValue);
    if (filters.search) params.set("search", filters.search);
    return params.toString();
  }, [filters]);

  const queryString = useMemo(() => buildQueryString(), [buildQueryString]);

  const { data: wines, isLoading, refetch } = useQuery<WineListItem[]>({
    queryKey: ["/api/wines", queryString],
  });

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ["/api/stats"],
  });

  const { data: filterOptions } = useQuery<FilterOptions>({
    queryKey: ["/api/filters"],
  });

  const sections = useMemo(() => {
    if (!wines || wines.length === 0) return [];
    return groupWinesIntoSections(wines, filters.sort);
  }, [wines, filters.sort]);

  const handleSearchSubmit = useCallback(() => {
    setFilters((prev) => ({ ...prev, search: searchText }));
  }, [searchText]);

  const handleRefresh = useCallback(() => {
    refetch();
    refetchStats();
  }, [refetch, refetchStats]);

  const renderItem = useCallback(({ item }: { item: WineListItem }) => (
    <WineCard
      wine={item}
      onPress={() => router.push({ pathname: "/wine/[id]", params: { id: String(item.id) } })}
    />
  ), []);

  const renderSectionHeader = useCallback(({ section }: { section: Section }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  ), []);

  const keyExtractor = useCallback((item: WineListItem) => String(item.id), []);

  const handleScrubberPress = useCallback(
    (sectionIndex: number) => {
      if (sectionListRef.current && sectionIndex < sections.length) {
        sectionListRef.current.scrollToLocation({
          sectionIndex,
          itemIndex: 0,
          viewOffset: 0,
          animated: false,
        });
      }
    },
    [sections.length]
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <Text style={styles.title}>Cellar</Text>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={Colors.light.tabIconDefault} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search wines..."
            placeholderTextColor={Colors.light.tabIconDefault}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
          />
          {searchText ? (
            <Pressable onPress={() => { setSearchText(""); setFilters((p) => ({ ...p, search: "" })); }}>
              <Ionicons name="close-circle" size={18} color={Colors.light.tabIconDefault} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.listWrapper}>
        <SectionList
          ref={sectionListRef}
          sections={sections}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={keyExtractor}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <>
              <StatsBar stats={stats} isLoading={statsLoading} />
              <FilterPanel
                filters={filters}
                onChange={setFilters}
                options={filterOptions}
                isExpanded={filtersExpanded}
                onToggle={() => setFiltersExpanded(!filtersExpanded)}
              />
            </>
          }
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.light.tint} />
              </View>
            ) : (
              <View style={styles.centered}>
                <Ionicons name="wine-outline" size={48} color={Colors.light.tabIconDefault} />
                <Text style={styles.emptyTitle}>No wines found</Text>
                <Text style={styles.emptyText}>Import your CellarTracker CSV or add wines manually</Text>
              </View>
            )
          }
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={Colors.light.tint} />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: isWeb ? 84 + 34 : insets.bottom + 90 },
          ]}
          scrollEnabled={sections.length > 0}
          onScrollToIndexFailed={() => {}}
        />
        <SectionScrubber sections={sections} onSectionPress={handleScrubberPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  title: {
    fontSize: 28,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    padding: 0,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    backgroundColor: Colors.light.background,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.tint,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  },
  scrubberContainer: {
    position: "absolute" as const,
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 8,
  },
  scrubberItem: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minHeight: 14,
  },
  scrubberText: {
    fontSize: 9,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Outfit_300Light",
    color: Colors.light.textSecondary,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
