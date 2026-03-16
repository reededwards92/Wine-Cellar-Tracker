import React from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import { apiRequest, queryClient } from "@/lib/query-client";

interface Memory {
  id: number;
  content: string;
  category: string;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  preference: "Preferences",
  occasion: "Occasions & Memories",
  milestone: "Milestones",
  general: "Other",
};

const CATEGORY_ORDER = ["preference", "occasion", "milestone", "general"];

export default function CruProfileScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";

  const { data: memories, isLoading } = useQuery<Memory[]>({
    queryKey: ["/api/memories"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/memories/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/memories"] });
    },
  });

  const handleDelete = (id: number) => {
    Alert.alert("Delete Note", "Remove this note from Cru's memory?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const grouped = CATEGORY_ORDER
    .map((cat) => ({
      title: CATEGORY_LABELS[cat] || cat,
      data: (memories || []).filter((m) => (m.category || "general") === cat),
    }))
    .filter((s) => s.data.length > 0);

  return (
    <LinearGradient
      colors={[Colors.light.bgGradientStart, Colors.light.bgGradientEnd]}
      style={styles.screen}
    >
      <View style={[styles.navBar, { paddingTop: isWeb ? 67 : insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.tint} />
        </Pressable>
        <Text style={styles.navTitle}>Cru's Notes on You</Text>
        <View style={{ width: 32 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      ) : grouped.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="sparkles" size={48} color={Colors.light.tabIconDefault} />
          <Text style={styles.emptyTitle}>No notes yet</Text>
          <Text style={styles.emptyText}>
            Cru doesn't have any notes yet. Start chatting to build your taste profile.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={grouped}
          keyExtractor={(item) => String(item.id)}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.memoryRow}>
              <View style={styles.memoryDot} />
              <Text style={styles.memoryText}>{item.content}</Text>
              <Pressable onPress={() => handleDelete(item.id)} hitSlop={8} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={16} color={Colors.light.tabIconDefault} />
              </Pressable>
            </View>
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: isWeb ? 34 : insets.bottom + 20 },
          ]}
          stickySectionHeadersEnabled={false}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    ...theme.typography.heading2,
    color: Colors.light.text,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: {
    ...theme.typography.heading3,
    color: Colors.light.text,
  },
  emptyText: {
    ...theme.typography.bodySmall,
    color: Colors.light.textSecondary,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: 16,
  },
  sectionHeader: {
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    ...theme.typography.overline,
    color: Colors.light.tint,
  },
  memoryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.divider,
    gap: 10,
  },
  memoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.tint,
    marginTop: 6,
  },
  memoryText: {
    ...theme.typography.body,
    color: Colors.light.text,
    flex: 1,
  },
  deleteBtn: {
    opacity: 0.4,
    padding: 4,
  },
});
