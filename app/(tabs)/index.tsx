import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Platform,
  RefreshControl,
  Pressable,
  ActivityIndicator,
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

export default function CellarScreen() {
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [searchText, setSearchText] = useState("");
  const isWeb = Platform.OS === "web";

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

  const keyExtractor = useCallback((item: WineListItem) => String(item.id), []);

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

      <FlatList
        data={wines || []}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
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
        scrollEnabled={!!(wines && wines.length > 0)}
      />
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
  listContent: {
    flexGrow: 1,
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
