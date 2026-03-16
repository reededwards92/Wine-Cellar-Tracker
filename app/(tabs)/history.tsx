import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import { getColorDot } from "@/lib/api";
import type { ConsumptionEntry } from "@/lib/api";
import { apiRequest, queryClient } from "@/lib/query-client";
import CruHeaderIcon from "@/components/CruHeaderIcon";
import { useCruInsights } from "@/contexts/CruInsightsContext";

const WINE_COLORS: Record<string, string> = {
  Red: Colors.light.colorRed,
  White: Colors.light.colorWhite,
  "Ros\u00e9": Colors.light.colorRose,
  Sparkling: Colors.light.colorSparkling,
  Dessert: Colors.light.colorDessert,
  Fortified: Colors.light.colorFortified,
  Orange: "#D2691E",
};

interface ConsumptionStats {
  totalBottles: number;
  totalGlasses: number;
  totalValue: number;
  colorBreakdown: { color: string; count: number }[];
  monthlyTrend: { month: string; label: string; count: number }[];
  yearlyComparison?: { label: string; current: number; prior: number }[];
}

function DonutChart({ data, size }: { data: { color: string; count: number }[]; size: number }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 8;
  const innerRadius = radius * 0.6;

  let startAngle = -Math.PI / 2;
  const paths = data.map((d) => {
    const sweep = (d.count / total) * 2 * Math.PI;
    const endAngle = startAngle + sweep;
    const largeArc = sweep > Math.PI ? 1 : 0;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const ix1 = cx + innerRadius * Math.cos(endAngle);
    const iy1 = cy + innerRadius * Math.sin(endAngle);
    const ix2 = cx + innerRadius * Math.cos(startAngle);
    const iy2 = cy + innerRadius * Math.sin(startAngle);

    const pathD = data.length === 1
      ? `M ${cx + radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx + radius - 0.01} ${cy} Z M ${cx + innerRadius} ${cy} A ${innerRadius} ${innerRadius} 0 1 0 ${cx + innerRadius - 0.01} ${cy} Z`
      : `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;

    startAngle = endAngle;
    return { path: pathD, fill: WINE_COLORS[d.color] || Colors.light.tabIconDefault };
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => (
        <Path key={i} d={p.path} fill={p.fill} />
      ))}
    </Svg>
  );
}

function BarChart({ data, secondSeries, currentYear, priorYear }: {
  data: { label: string; count: number }[];
  secondSeries?: { label: string; count: number }[];
  currentYear?: number;
  priorYear?: number;
}) {
  if (data.length === 0) return null;
  const allCounts = [...data.map((d) => d.count), ...(secondSeries?.map((d) => d.count) || [])];
  const maxCount = Math.max(...allCounts, 1);
  const hasTwo = !!secondSeries;
  const barWidth = Math.min(hasTwo ? 16 : 28, (Dimensions.get("window").width - 80) / data.length / (hasTwo ? 2 : 1) - 4);
  const chartHeight = 120;

  return (
    <View>
      {hasTwo && currentYear && priorYear ? (
        <View style={{ flexDirection: "row", gap: 16, marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: Colors.light.tint }} />
            <Text style={styles.barLabel}>{currentYear}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: Colors.light.tint + "60" }} />
            <Text style={styles.barLabel}>{priorYear}</Text>
          </View>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barChartScroll}>
        {data.map((d, i) => {
          const d2 = secondSeries?.[i];
          const barH1 = maxCount > 0 ? (d.count / maxCount) * (chartHeight - 20) : 0;
          const barH2 = d2 ? (maxCount > 0 ? (d2.count / maxCount) * (chartHeight - 20) : 0) : 0;
          return (
            <View key={i} style={[styles.barCol, { width: (barWidth + 2) * (hasTwo ? 2 : 1) + 8 }]}>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
                <View style={{ alignItems: "center", gap: 4 }}>
                  <Text style={styles.barCount}>{d.count > 0 ? d.count : ""}</Text>
                  <View style={[styles.bar, { height: Math.max(barH1, d.count > 0 ? 4 : 1), width: barWidth, backgroundColor: d.count > 0 ? Colors.light.tint : Colors.light.border }]} />
                </View>
                {d2 !== undefined ? (
                  <View style={{ alignItems: "center", gap: 4 }}>
                    <Text style={[styles.barCount, { color: Colors.light.tabIconDefault }]}>{d2.count > 0 ? d2.count : ""}</Text>
                    <View style={[styles.bar, { height: Math.max(barH2, d2.count > 0 ? 4 : 1), width: barWidth, backgroundColor: d2.count > 0 ? Colors.light.tint + "60" : Colors.light.border }]} />
                  </View>
                ) : null}
              </View>
              <Text style={styles.barLabel} numberOfLines={1}>{d.label}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function StarRating({ rating }: { rating: number }) {
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Ionicons
          key={i}
          name={i <= rating ? "star" : "star-outline"}
          size={14}
          color={i <= rating ? Colors.light.warning : Colors.light.tabIconDefault}
        />
      ))}
    </View>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const month = months[parseInt(parts[1], 10) - 1] || parts[1];
    return `${month} ${parseInt(parts[2], 10)}, ${parts[0]}`;
  }
  return dateStr;
}

function ConsumptionCard({
  entry,
  onPress,
  editing,
  selected,
  onToggle,
}: {
  entry: ConsumptionEntry;
  onPress: () => void;
  editing: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const location = entry.sub_region || entry.appellation || entry.region || "";
  const price = entry.estimated_value || entry.purchase_price;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={editing ? onToggle : onPress}
    >
      {editing ? (
        <Pressable onPress={onToggle} style={styles.checkbox} hitSlop={8}>
          <Ionicons
            name={selected ? "checkbox" : "square-outline"}
            size={22}
            color={selected ? Colors.light.tint : Colors.light.tabIconDefault}
          />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <View style={styles.cardHeader}>
          <View style={[styles.colorDot, { backgroundColor: getColorDot(entry.color) }]} />
          <View style={styles.cardContent}>
            <Text style={styles.cardProducer} numberOfLines={1}>{entry.producer}</Text>
            <Text style={styles.cardWine} numberOfLines={1}>
              {entry.wine_name}
              {entry.vintage ? ` ${entry.vintage}` : ""}
            </Text>
            {(location || entry.varietal) ? (
              <View style={styles.metaRow}>
                {location ? (
                  <Text style={styles.meta} numberOfLines={1}>{location}</Text>
                ) : null}
                {entry.varietal ? (
                  <Text style={styles.meta}>{location ? " \u00b7 " : ""}{entry.varietal}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
          <View style={styles.right}>
            <Text style={styles.cardDate}>{formatDate(entry.consumed_date)}</Text>
            {price ? (
              <Text style={styles.value}>${Math.round(price)}</Text>
            ) : null}
            {entry.ct_community_score ? (
              <Text style={styles.score}>{Math.round(entry.ct_community_score)}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.cardMeta}>
          {entry.rating ? <StarRating rating={entry.rating} /> : null}
          {entry.occasion ? (
            <Text style={styles.cardOccasion}>{entry.occasion}</Text>
          ) : null}
        </View>
        {entry.tasting_notes ? (
          <Text style={styles.cardNotes} numberOfLines={2}>{entry.tasting_notes}</Text>
        ) : null}
        {entry.paired_with ? (
          <View style={styles.pairingRow}>
            <Ionicons name="restaurant-outline" size={13} color={Colors.light.textSecondary} />
            <Text style={styles.pairingText}>{entry.paired_with}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function StatsSection({ stats }: { stats: ConsumptionStats }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const donutSize = 140;

  return (
    <Animated.View style={[styles.statsContainer, { opacity: fadeAnim }]}>
      <View style={styles.topCards}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>~{stats.totalGlasses}</Text>
          <Text style={styles.statLabel}>Glasses Poured</Text>
          <Text style={styles.statFun}>{stats.totalBottles} bottle{stats.totalBottles !== 1 ? "s" : ""} consumed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>${stats.totalValue > 0 ? stats.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"}</Text>
          <Text style={styles.statLabel}>Total Value Enjoyed</Text>
          <Text style={styles.statFun}>{stats.totalBottles > 0 ? `~$${Math.round(stats.totalValue / stats.totalBottles)}/bottle avg` : ""}</Text>
        </View>
      </View>

      {stats.colorBreakdown.length > 0 ? (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>What You've Been Drinking</Text>
          <View style={styles.donutRow}>
            <View style={styles.donutWrapper}>
              <DonutChart data={stats.colorBreakdown} size={donutSize} />
              <View style={[styles.donutCenter, { width: donutSize, height: donutSize }]}>
                <Text style={styles.donutCenterNumber}>{stats.totalBottles}</Text>
                <Text style={styles.donutCenterLabel}>total</Text>
              </View>
            </View>
            <View style={styles.legendContainer}>
              {stats.colorBreakdown.map((d) => (
                <View key={d.color} style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: WINE_COLORS[d.color] || Colors.light.tabIconDefault }]} />
                  <Text style={styles.legendText}>{d.color}</Text>
                  <Text style={styles.legendCount}>{d.count}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {stats.monthlyTrend.length > 0 ? (
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Monthly Trend</Text>
          <View style={styles.barChartContainer}>
            {stats.yearlyComparison && stats.yearlyComparison.some(y => y.prior > 0) ? (
              <BarChart
                data={stats.yearlyComparison.map(y => ({ label: y.label, count: y.current }))}
                secondSeries={stats.yearlyComparison.map(y => ({ label: y.label, count: y.prior }))}
                currentYear={new Date().getFullYear()}
                priorYear={new Date().getFullYear() - 1}
              />
            ) : (
              <BarChart data={stats.monthlyTrend} />
            )}
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const { hasNewInsight } = useCruInsights();
  const params = useLocalSearchParams<{ rated?: string }>();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterColor, setFilterColor] = useState<string[]>([]);
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [filterRated, setFilterRated] = useState<"all" | "rated" | "unrated">(
    params.rated === "false" ? "unrated" : params.rated === "true" ? "rated" : "all"
  );
  const [showFilters, setShowFilters] = useState(!!params.rated);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    if (params.rated === "false") {
      setFilterRated("unrated");
      setShowFilters(true);
    } else if (params.rated === "true") {
      setFilterRated("rated");
      setShowFilters(true);
    }
  }, [params.rated]);

  const filterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filterSearch) p.set("search", filterSearch);
    if (filterColor.length > 0) p.set("color", filterColor.join(","));
    if (filterMinRating > 0) p.set("min_rating", String(filterMinRating));
    if (filterRated === "rated") p.set("rated", "true");
    if (filterRated === "unrated") p.set("rated", "false");
    return p.toString();
  }, [filterSearch, filterColor, filterMinRating, filterRated]);

  const {
    data: pagedData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery<{ entries: ConsumptionEntry[]; total: number; hasMore: boolean; page: number }>({
    queryKey: ["/api/consumption", filterParams],
    queryFn: async ({ pageParam }) => {
      const sep = filterParams ? "&" : "";
      const res = await apiRequest("GET", `/api/consumption?${filterParams}${sep}page=${pageParam ?? 1}&limit=30`);
      return res.json();
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    initialPageParam: 1,
  });

  const entries = useMemo(() => pagedData?.pages.flatMap((p) => p.entries) ?? [], [pagedData]);
  const totalCount = pagedData?.pages[0]?.total ?? 0;

  const { data: stats } = useQuery<ConsumptionStats>({
    queryKey: ["/api/consumption/stats"],
    enabled: !!(entries && entries.length > 0),
  });

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  };

  const exitEditing = () => {
    setEditing(false);
    setSelected(new Set());
  };

  const handleDelete = () => {
    if (selected.size === 0) return;
    Alert.alert(
      "Delete History",
      `Delete ${selected.size} consumption record${selected.size !== 1 ? "s" : ""}? This will also remove the consumed bottle records.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await apiRequest("DELETE", "/api/consumption", { ids: Array.from(selected) });
              queryClient.invalidateQueries({ queryKey: ["/api/consumption"] });
              queryClient.invalidateQueries({ queryKey: ["/api/consumption/stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
              queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
              exitEditing();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to delete");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const allSelected = entries.length > 0 && selected.size === entries.length;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/consumption"] });
    queryClient.invalidateQueries({ queryKey: ["/api/consumption/stats"] });
    refetch();
  };

  const hasActiveFilters = filterColor.length > 0 || filterMinRating > 0 || filterSearch || filterRated !== "all";

  const openList = () => {
    setShowList(true);
    setShowFilters(false);
  };

  const closeList = () => {
    setShowList(false);
    setEditing(false);
    setSelected(new Set());
  };

  return (
    <LinearGradient colors={[Colors.light.bgGradientStart, Colors.light.bgGradientEnd]} style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>History</Text>
            {entries.length > 0 && !editing ? (
              <Text style={styles.subtitle}>{totalCount} bottle{totalCount !== 1 ? "s" : ""} consumed</Text>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {showList ? (
              <Pressable onPress={closeList} hitSlop={8}>
                <Ionicons name="stats-chart-outline" size={20} color={Colors.light.textSecondary} />
              </Pressable>
            ) : null}
            {showList && entries.length > 0 ? (
              <Pressable onPress={editing ? exitEditing : () => setEditing(true)} hitSlop={8}>
                <Text style={styles.editBtn}>{editing ? "Done" : "Edit"}</Text>
              </Pressable>
            ) : null}
            <CruHeaderIcon
              onPress={() => router.navigate("/(tabs)/sommelier")}
              showBadge={hasNewInsight}
            />
          </View>
        </View>

        {editing ? (
          <View style={styles.editBar}>
            <Pressable onPress={selectAll} style={styles.selectAllBtn} hitSlop={4}>
              <Ionicons
                name={allSelected ? "checkbox" : "square-outline"}
                size={20}
                color={Colors.light.tint}
              />
              <Text style={styles.selectAllText}>{allSelected ? "Deselect All" : "Select All"}</Text>
            </Pressable>
            {selected.size > 0 ? (
              <Pressable onPress={handleDelete} style={styles.deleteBtn} disabled={deleting}>
                {deleting ? (
                  <ActivityIndicator size="small" color={Colors.light.danger} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color={Colors.light.danger} />
                    <Text style={styles.deleteBtnText}>Delete ({selected.size})</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <Text style={styles.selectedCount}>{selected.size} selected</Text>
            )}
          </View>
        ) : null}

        {/* Search bar — only visible in list view */}
        {showList && !editing ? (
          <View style={styles.searchRow}>
            <Ionicons name="search" size={15} color={Colors.light.tabIconDefault} />
            <TextInput
              style={styles.searchInput}
              value={filterSearch}
              onChangeText={setFilterSearch}
              placeholder="Search history..."
              placeholderTextColor="rgba(114, 47, 55, 0.40)"
              returnKeyType="search"
            />
            {filterSearch ? (
              <Pressable onPress={() => setFilterSearch("")}>
                <Ionicons name="close-circle" size={15} color={Colors.light.tabIconDefault} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Filter toggle — only visible in list view */}
        {showList && !editing ? (
          <Pressable
            style={styles.filterToggle}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons name="options-outline" size={16} color={hasActiveFilters ? Colors.light.tint : Colors.light.textSecondary} />
            <Text style={[styles.filterToggleText, hasActiveFilters && { color: Colors.light.tint }]}>
              Filter{hasActiveFilters ? " (active)" : ""}
            </Text>
            <Ionicons name={showFilters ? "chevron-up" : "chevron-down"} size={14} color={Colors.light.tabIconDefault} />
          </Pressable>
        ) : null}

        {showList && showFilters && !editing ? (
          <View style={styles.filterPanel}>
            <Text style={styles.filterLabel}>Color</Text>
            <View style={styles.filterChips}>
              {["Red", "White", "Rosé", "Sparkling", "Dessert", "Fortified"].map((c) => (
                <Pressable
                  key={c}
                  style={[styles.filterChip, filterColor.includes(c) && styles.filterChipActive]}
                  onPress={() =>
                    setFilterColor((prev) =>
                      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
                    )
                  }
                >
                  <Text style={[styles.filterChipText, filterColor.includes(c) && styles.filterChipTextActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterLabel}>Min Rating</Text>
            <View style={styles.ratingFilter}>
              {[0, 1, 2, 3, 4, 5].map((r) => (
                <Pressable key={r} onPress={() => setFilterMinRating(r === filterMinRating ? 0 : r)}>
                  {r === 0 ? (
                    <Text style={[styles.ratingFilterAny, filterMinRating === 0 && styles.ratingFilterAnyActive]}>Any</Text>
                  ) : (
                    <Ionicons
                      name={r <= filterMinRating ? "star" : "star-outline"}
                      size={24}
                      color={r <= filterMinRating ? Colors.light.warning : Colors.light.tabIconDefault}
                    />
                  )}
                </Pressable>
              ))}
            </View>

            <Text style={styles.filterLabel}>Rating Status</Text>
            <View style={styles.filterChips}>
              {([["all", "All"], ["rated", "Rated"], ["unrated", "Unrated"]] as const).map(([val, label]) => (
                <Pressable
                  key={val}
                  style={[styles.filterChip, filterRated === val && styles.filterChipActive]}
                  onPress={() => setFilterRated(val)}
                >
                  <Text style={[styles.filterChipText, filterRated === val && styles.filterChipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            {hasActiveFilters ? (
              <Pressable
                style={styles.clearFiltersBtn}
                onPress={() => { setFilterColor([]); setFilterMinRating(0); setFilterSearch(""); setFilterRated("all"); }}
              >
                <Text style={styles.clearFiltersBtnText}>Clear All Filters</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Stats view (default) */}
      {!showList ? (
        <ScrollView
          contentContainerStyle={[
            styles.statsScrollContent,
            { paddingBottom: isWeb ? 84 + 24 : insets.bottom + 80 },
          ]}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={Colors.light.tint} />
          }
        >
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={Colors.light.tint} />
            </View>
          ) : entries.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="time-outline" size={48} color={Colors.light.tabIconDefault} />
              <Text style={styles.emptyTitle}>No consumption history</Text>
              <Text style={styles.emptyText}>When you mark bottles as consumed, they'll appear here</Text>
            </View>
          ) : (
            <>
              {stats && stats.totalBottles > 0 ? (
                <StatsSection stats={stats} />
              ) : null}
              <Pressable
                style={({ pressed }) => [styles.accordionBtn, pressed && styles.accordionBtnPressed]}
                onPress={openList}
              >
                <Ionicons name="chevron-down" size={16} color={Colors.light.tint} />
                <Text style={styles.accordionBtnText}>
                  Show all consumed wines ({totalCount})
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      ) : (
        /* List view */
        <FlatList
          data={entries}
          renderItem={({ item }) => (
            <ConsumptionCard
              entry={item}
              onPress={() => router.push({ pathname: "/wine/[id]", params: { id: String(item.wine_id) } })}
              editing={editing}
              selected={selected.has(item.id)}
              onToggle={() => toggleSelect(item.id)}
            />
          )}
          keyExtractor={(item) => String(item.id)}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.light.tint} />
              </View>
            ) : (
              <View style={styles.centered}>
                <Ionicons name="search-outline" size={40} color={Colors.light.tabIconDefault} />
                <Text style={styles.emptyTitle}>No results</Text>
                <Text style={styles.emptyText}>Try adjusting your search or filters</Text>
              </View>
            )
          }
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={Colors.light.tint} />
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: isWeb ? 84 + 24 : insets.bottom + 80 },
          ]}
          onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View style={{ paddingVertical: 20, alignItems: "center" }}>
                <ActivityIndicator size="small" color={Colors.light.tint} />
              </View>
            ) : null
          }
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "transparent",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  editBtn: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  editBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(114, 47, 55, 0.08)",
  },
  selectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  selectAllText: {
    fontSize: 14,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  selectedCount: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
  },
  deleteBtnText: {
    fontSize: 14,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.danger,
  },
  statsContainer: {
    padding: 16,
    gap: 12,
  },
  topCards: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.glassBg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: Colors.light.glassBorder,
    ...theme.shadows.glass,
    padding: 16,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 32,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
  },
  statLabel: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: "rgba(45, 18, 21, 0.55)",
    marginTop: 2,
    textAlign: "center",
  },
  statFun: {
    fontSize: 11,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 4,
    textAlign: "center",
  },
  chartCard: {
    backgroundColor: Colors.light.glassBg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: Colors.light.glassBorder,
    ...theme.shadows.glass,
    padding: 16,
  },
  chartTitle: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
    marginBottom: 16,
  },
  donutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  donutWrapper: {
    position: "relative",
  },
  donutCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  donutCenterNumber: {
    fontSize: 24,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
  },
  donutCenterLabel: {
    fontSize: 11,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    marginTop: -2,
  },
  legendContainer: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    flex: 1,
  },
  legendCount: {
    fontSize: 13,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
  },
  barChartContainer: {
    height: 150,
    justifyContent: "flex-end",
  },
  barChartScroll: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    paddingBottom: 4,
  },
  barCol: {
    alignItems: "center",
    gap: 4,
  },
  bar: {
    borderRadius: 4,
    minHeight: 1,
  },
  barCount: {
    fontSize: 10,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.textSecondary,
    height: 14,
  },
  barLabel: {
    fontSize: 9,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  listContent: {
    flexGrow: 1,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "transparent",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(114, 47, 55, 0.08)",
  },
  cardPressed: {
    backgroundColor: Colors.light.cardBackground,
  },
  checkbox: {
    marginRight: 12,
    marginTop: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
    marginRight: 10,
  },
  cardContent: {
    flex: 1,
  },
  cardProducer: {
    fontSize: 14,
    fontFamily: "LibreBaskerville_400Regular",
    color: Colors.light.text,
  },
  cardWine: {
    fontSize: 13,
    fontFamily: "LibreBaskerville_400Regular",
    color: "rgba(45, 18, 21, 0.60)",
    marginTop: 1,
  },
  metaRow: {
    flexDirection: "row",
    marginTop: 3,
    flexWrap: "wrap",
  },
  meta: {
    fontSize: 12,
    fontFamily: "Outfit_300Light",
    color: "rgba(45, 18, 21, 0.45)",
  },
  right: {
    alignItems: "flex-end",
    marginLeft: 12,
    gap: 2,
  },
  cardDate: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    color: "rgba(45, 18, 21, 0.50)",
  },
  value: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  score: {
    fontSize: 12,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.textSecondary,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    marginLeft: 20,
  },
  stars: {
    flexDirection: "row",
    gap: 2,
  },
  cardOccasion: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  cardNotes: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    marginTop: 6,
    marginLeft: 20,
    lineHeight: 18,
  },
  pairingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    marginLeft: 20,
  },
  pairingText: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  statsScrollContent: {
    flexGrow: 1,
  },
  accordionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: 1,
    borderColor: "rgba(114,47,55,0.10)",
  },
  accordionBtnPressed: {
    backgroundColor: Colors.light.cardBackground,
  },
  accordionBtnText: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.60)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(114,47,55,0.15)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    marginTop: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    padding: 0,
  },
  filterToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(114, 47, 55, 0.08)",
  },
  filterToggleText: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: "rgba(114, 47, 55, 0.55)",
    flex: 1,
  },
  filterPanel: {
    paddingTop: 8,
  },
  filterLabel: {
    fontSize: 11,
    fontFamily: "Outfit_400Regular",
    color: "rgba(114, 47, 55, 0.55)",
    marginBottom: 6,
  },
  filterChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(114,47,55,0.20)",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  filterChipActive: {
    backgroundColor: "rgba(114,47,55,0.15)",
    borderColor: "rgba(114,47,55,0.45)",
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    color: "rgba(45,18,21,0.70)",
  },
  filterChipTextActive: {
    color: "#722F37",
  },
  ratingFilter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  ratingFilterAny: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tabIconDefault,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  ratingFilterAnyActive: {
    color: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  clearFiltersBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.danger,
  },
  clearFiltersBtnText: {
    fontSize: 12,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.danger,
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
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
