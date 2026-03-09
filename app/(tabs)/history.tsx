import React, { useState } from "react";
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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getColorDot } from "@/lib/api";
import type { ConsumptionEntry } from "@/lib/api";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";

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
                  <Text style={styles.meta}>{location ? " · " : ""}{entry.varietal}</Text>
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
              <Text style={styles.score}>{entry.ct_community_score.toFixed(1)}</Text>
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

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const { data: entries, isLoading, refetch } = useQuery<ConsumptionEntry[]>({
    queryKey: ["/api/consumption"],
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
    if (!entries) return;
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

  const allSelected = entries && entries.length > 0 && selected.size === entries.length;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>History</Text>
            {entries && entries.length > 0 && !editing ? (
              <Text style={styles.subtitle}>{entries.length} bottle{entries.length !== 1 ? "s" : ""} consumed</Text>
            ) : null}
          </View>
          {entries && entries.length > 0 ? (
            <Pressable
              onPress={editing ? exitEditing : () => setEditing(true)}
              hitSlop={8}
            >
              <Text style={styles.editBtn}>{editing ? "Done" : "Edit"}</Text>
            </Pressable>
          ) : null}
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
      </View>

      <FlatList
        data={entries || []}
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
              <Ionicons name="time-outline" size={48} color={Colors.light.tabIconDefault} />
              <Text style={styles.emptyTitle}>No consumption history</Text>
              <Text style={styles.emptyText}>When you mark bottles as consumed, they'll appear here</Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={Colors.light.tint} />
        }
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: isWeb ? 84 + 34 : insets.bottom + 90 },
        ]}
        scrollEnabled={!!(entries && entries.length > 0)}
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
    paddingBottom: 12,
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
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
    marginTop: 6,
  },
  editBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
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
  listContent: {
    flexGrow: 1,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.light.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
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
    fontSize: 15,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
  },
  cardWine: {
    fontSize: 13,
    fontFamily: "LibreBaskerville_400Regular",
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
    fontFamily: "Outfit_300Light",
    color: Colors.light.textSecondary,
  },
  right: {
    alignItems: "flex-end",
    marginLeft: 12,
    gap: 2,
  },
  cardDate: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  value: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  score: {
    fontSize: 12,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
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
