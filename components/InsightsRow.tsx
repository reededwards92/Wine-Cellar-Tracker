import React, { useState } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import InsightCard from "./InsightCard";
import type { InsightCard as InsightCardType } from "@/lib/api";

interface Props {
  insights: InsightCardType[];
  onCardPress: (card: InsightCardType) => void;
  isLoading: boolean;
}

function SkeletonCard() {
  return (
    <View style={styles.skeleton}>
      <View style={styles.skeletonAccent} />
      <View style={styles.skeletonBody}>
        <View style={[styles.skeletonLine, { width: "60%" }]} />
        <View style={[styles.skeletonLine, { width: "90%", marginTop: 8 }]} />
        <View style={[styles.skeletonLine, { width: "40%", marginTop: 16 }]} />
      </View>
    </View>
  );
}

export default function InsightsRow({ insights, onCardPress, isLoading }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (!isLoading && insights.length === 0) return null;

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={() => setExpanded((p) => !p)}>
        <View style={styles.headerLeft}>
          <Ionicons name="sparkles" size={16} color={Colors.light.tint} />
          <Text style={styles.headerText}>Cru's Picks</Text>
          {!expanded && insights.length > 0 && (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{insights.length}</Text>
            </View>
          )}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color="rgba(45, 18, 21, 0.45)"
        />
      </Pressable>
      {expanded && (
        isLoading ? (
          <View style={styles.skeletonRow}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (
          <FlatList
            horizontal
            data={insights}
            keyExtractor={(item) => item.type}
            renderItem={({ item }) => (
              <InsightCard card={item} onPress={() => onCardPress(item)} />
            )}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerText: {
    fontFamily: theme.fonts.libre.bold,
    fontSize: 16,
    color: Colors.light.text,
  },
  countBadge: {
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  countText: {
    fontSize: 11,
    fontFamily: theme.fonts.outfit.semiBold,
    color: "#fff",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  skeletonRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 12,
  },
  skeleton: {
    width: 200,
    height: 140,
    backgroundColor: Colors.light.cardBackground,
    borderRadius: theme.radius.lg,
    flexDirection: "row",
    overflow: "hidden",
    ...theme.shadows.card,
  },
  skeletonAccent: {
    width: 4,
    backgroundColor: Colors.light.border,
  },
  skeletonBody: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
  },
  skeletonLine: {
    height: 10,
    borderRadius: 4,
    backgroundColor: Colors.light.divider,
  },
});
