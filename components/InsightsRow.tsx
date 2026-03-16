import React from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
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
  if (!isLoading && insights.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={16} color={Colors.light.tint} />
        <Text style={styles.headerText}>Cru's Picks</Text>
      </View>
      {isLoading ? (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerText: {
    fontFamily: theme.fonts.libre.bold,
    fontSize: 16,
    color: Colors.light.text,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  skeletonRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
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
