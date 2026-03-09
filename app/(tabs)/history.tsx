import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Platform,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getColorDot } from "@/lib/api";
import type { ConsumptionEntry } from "@/lib/api";

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

function ConsumptionCard({ entry, onPress }: { entry: ConsumptionEntry; onPress: () => void }) {
  const location = entry.sub_region || entry.appellation || entry.region || "";
  const price = entry.estimated_value || entry.purchase_price;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
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
      <View style={styles.chevronRow}>
        <Ionicons name="chevron-forward" size={16} color={Colors.light.tabIconDefault} />
      </View>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();

  const { data: entries, isLoading, refetch } = useQuery<ConsumptionEntry[]>({
    queryKey: ["/api/consumption"],
  });

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <Text style={styles.title}>History</Text>
        {entries && entries.length > 0 ? (
          <Text style={styles.subtitle}>{entries.length} bottle{entries.length !== 1 ? "s" : ""} consumed</Text>
        ) : null}
      </View>

      <FlatList
        data={entries || []}
        renderItem={({ item }) => (
          <ConsumptionCard
            entry={item}
            onPress={() => router.push({ pathname: "/wine/[id]", params: { id: String(item.wine_id) } })}
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
  listContent: {
    flexGrow: 1,
  },
  card: {
    backgroundColor: Colors.light.white,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  cardPressed: {
    backgroundColor: Colors.light.cardBackground,
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
  chevronRow: {
    position: "absolute" as const,
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
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
