import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getColorDot, getDrinkWindowStatus } from "@/lib/api";
import { apiRequest, queryClient } from "@/lib/query-client";
import type { WineDetail, Bottle } from "@/lib/api";

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{String(value)}</Text>
    </View>
  );
}

const LOCATION_OPTIONS = ["Rack", "Cabinet", "Fridge"];

function BottleCard({ bottle, onConsume, onLocationChange }: { bottle: Bottle; onConsume: () => void; onLocationChange: (location: string | null) => void }) {
  return (
    <View style={styles.bottleCard}>
      <View style={styles.bottleHeader}>
        <View style={[styles.statusBadge, {
          backgroundColor: bottle.status === "in_cellar" ? Colors.light.success + "20" : Colors.light.tabIconDefault + "20"
        }]}>
          <Text style={[styles.statusText, {
            color: bottle.status === "in_cellar" ? Colors.light.success : Colors.light.textSecondary
          }]}>
            {bottle.status === "in_cellar" ? "In Cellar" : bottle.status}
          </Text>
        </View>
        <Text style={styles.bottleSize}>{bottle.size}</Text>
      </View>
      {bottle.status === "in_cellar" ? (
        <View style={styles.locationPickerRow}>
          {LOCATION_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
              style={[styles.locationPill, bottle.location === opt && styles.locationPillActive]}
              onPress={() => onLocationChange(bottle.location === opt ? null : opt)}
            >
              <Text style={[styles.locationPillText, bottle.location === opt && styles.locationPillTextActive]}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      ) : bottle.location ? (
        <Text style={styles.bottleMeta}>
          <Ionicons name="location-outline" size={12} color={Colors.light.textSecondary} /> {bottle.location}
        </Text>
      ) : null}
      {bottle.estimated_value ? (
        <Text style={styles.bottleMeta}>Value: ${bottle.estimated_value.toFixed(2)}</Text>
      ) : null}
      {bottle.purchase_date ? (
        <Text style={styles.bottleMeta}>Purchased: {bottle.purchase_date}</Text>
      ) : null}
      {bottle.notes ? (
        <Text style={styles.bottleNotes}>{bottle.notes}</Text>
      ) : null}
      {bottle.status === "in_cellar" ? (
        <Pressable style={styles.consumeBtn} onPress={onConsume}>
          <Ionicons name="wine-outline" size={16} color={Colors.light.tint} />
          <Text style={styles.consumeBtnText}>Mark as Consumed</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function WineDetailScreen() {
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [consumeModal, setConsumeModal] = useState(false);
  const [consumeBottleId, setConsumeBottleId] = useState<number | null>(null);
  const [consumeForm, setConsumeForm] = useState({
    occasion: "",
    paired_with: "",
    who_with: "",
    rating: 0,
    tasting_notes: "",
  });

  const { data: wine, isLoading } = useQuery<WineDetail>({
    queryKey: ["/api/wines", id],
  });

  const consumeMutation = useMutation({
    mutationFn: async () => {
      if (!consumeBottleId) return;
      const res = await apiRequest("PATCH", `/api/bottles/${consumeBottleId}/consume`, {
        occasion: consumeForm.occasion || null,
        paired_with: consumeForm.paired_with || null,
        who_with: consumeForm.who_with || null,
        rating: consumeForm.rating || null,
        tasting_notes: consumeForm.tasting_notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      setConsumeModal(false);
      setConsumeForm({ occasion: "", paired_with: "", who_with: "", rating: 0, tasting_notes: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/wines", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption"] });
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  const locationMutation = useMutation({
    mutationFn: async ({ bottleId, location }: { bottleId: number; location: string | null }) => {
      const res = await apiRequest("PUT", `/api/bottles/${bottleId}`, { location });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wines", id] });
    },
  });

  if (isLoading || !wine) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  const dwStatus = getDrinkWindowStatus(wine.drink_window_start, wine.drink_window_end);
  const dwColor =
    dwStatus === "in_window" ? Colors.light.success :
    dwStatus === "approaching" ? Colors.light.warning :
    dwStatus === "past_peak" ? Colors.light.danger :
    Colors.light.tabIconDefault;

  const inCellarBottles = wine.bottles?.filter((b) => b.status === "in_cellar") || [];

  return (
    <View style={styles.screen}>
      <View style={[styles.navBar, { paddingTop: isWeb ? 67 : insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.tint} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>Wine Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: isWeb ? 34 : insets.bottom + 20 }]}
      >
        <View style={styles.wineHeader}>
          <View style={[styles.colorDotLg, { backgroundColor: getColorDot(wine.color) }]} />
          <Text style={styles.producer}>{wine.producer}</Text>
          <Text style={styles.wineName}>
            {wine.wine_name}
            {wine.vintage ? ` ${wine.vintage}` : ""}
          </Text>
          {wine.ct_community_score ? (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreValue}>{wine.ct_community_score.toFixed(1)}</Text>
              <Text style={styles.scoreLabel}>Community</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>Details</Text>
          <InfoRow label="Color" value={wine.color} />
          <InfoRow label="Varietal" value={wine.varietal} />
          <InfoRow label="Country" value={wine.country} />
          <InfoRow label="Region" value={wine.region} />
          <InfoRow label="Sub-Region" value={wine.sub_region} />
          <InfoRow label="Appellation" value={wine.appellation} />
          <InfoRow label="Designation" value={wine.designation} />
          <InfoRow label="Vineyard" value={wine.vineyard} />
          {(wine.drink_window_start || wine.drink_window_end) ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Drink Window</Text>
              <View style={styles.dwRow}>
                <View style={[styles.dwDotSm, { backgroundColor: dwColor }]} />
                <Text style={[styles.infoValue, { color: dwColor }]}>
                  {wine.drink_window_start && wine.drink_window_end
                    ? `${wine.drink_window_start}–${wine.drink_window_end}`
                    : wine.drink_window_start
                      ? `From ${wine.drink_window_start}`
                      : `Until ${wine.drink_window_end}`}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>
            Bottles ({inCellarBottles.length} in cellar)
          </Text>
          {wine.bottles?.map((bottle) => (
            <BottleCard
              key={bottle.id}
              bottle={bottle}
              onConsume={() => {
                setConsumeBottleId(bottle.id);
                setConsumeModal(true);
              }}
              onLocationChange={(location) => locationMutation.mutate({ bottleId: bottle.id, location })}
            />
          ))}
        </View>
      </ScrollView>

      <Modal visible={consumeModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Consumption</Text>
              <Pressable onPress={() => setConsumeModal(false)}>
                <Ionicons name="close" size={24} color={Colors.light.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalLabel}>Rating</Text>
              <View style={styles.ratingRow}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <Pressable key={i} onPress={() => setConsumeForm((p) => ({ ...p, rating: i }))}>
                    <Ionicons
                      name={i <= consumeForm.rating ? "star" : "star-outline"}
                      size={32}
                      color={i <= consumeForm.rating ? Colors.light.warning : Colors.light.tabIconDefault}
                    />
                  </Pressable>
                ))}
              </View>

              <Text style={styles.modalLabel}>Occasion</Text>
              <TextInput
                style={styles.modalInput}
                value={consumeForm.occasion}
                onChangeText={(v) => setConsumeForm((p) => ({ ...p, occasion: v }))}
                placeholder="Dinner party, celebration..."
                placeholderTextColor={Colors.light.tabIconDefault}
              />

              <Text style={styles.modalLabel}>Paired With</Text>
              <TextInput
                style={styles.modalInput}
                value={consumeForm.paired_with}
                onChangeText={(v) => setConsumeForm((p) => ({ ...p, paired_with: v }))}
                placeholder="Grilled steak, cheese..."
                placeholderTextColor={Colors.light.tabIconDefault}
              />

              <Text style={styles.modalLabel}>Who With</Text>
              <TextInput
                style={styles.modalInput}
                value={consumeForm.who_with}
                onChangeText={(v) => setConsumeForm((p) => ({ ...p, who_with: v }))}
                placeholder="Friends, family..."
                placeholderTextColor={Colors.light.tabIconDefault}
              />

              <Text style={styles.modalLabel}>Tasting Notes</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 80 }]}
                value={consumeForm.tasting_notes}
                onChangeText={(v) => setConsumeForm((p) => ({ ...p, tasting_notes: v }))}
                placeholder="Describe the wine..."
                placeholderTextColor={Colors.light.tabIconDefault}
                multiline
                textAlignVertical="top"
              />
            </ScrollView>

            <Pressable
              style={styles.confirmBtn}
              onPress={() => consumeMutation.mutate()}
              disabled={consumeMutation.isPending}
            >
              {consumeMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>Confirm</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.cardBackground,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
    textAlign: "center",
  },
  scrollContent: {
    padding: 16,
  },
  wineHeader: {
    backgroundColor: Colors.light.white,
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
    marginBottom: 12,
  },
  colorDotLg: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginBottom: 10,
  },
  producer: {
    fontSize: 22,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
    textAlign: "center",
  },
  wineName: {
    fontSize: 15,
    fontFamily: "LibreBaskerville_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: 4,
  },
  scoreBadge: {
    marginTop: 12,
    backgroundColor: Colors.light.tint + "15",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: "center",
  },
  scoreValue: {
    fontSize: 18,
    fontFamily: "Outfit_700Bold",
    color: Colors.light.tint,
  },
  scoreLabel: {
    fontSize: 11,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.tint,
  },
  detailSection: {
    backgroundColor: Colors.light.white,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 12,
  },
  detailSectionTitle: {
    fontSize: 13,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
    textAlign: "right",
    flex: 1,
    marginLeft: 16,
  },
  dwRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dwDotSm: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  bottleCard: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  bottleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontFamily: "Outfit_500Medium",
  },
  bottleSize: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  bottleMeta: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  bottleNotes: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    marginTop: 4,
    fontStyle: "italic" as const,
  },
  locationPickerRow: {
    flexDirection: "row" as const,
    gap: 6,
    marginTop: 6,
  },
  locationPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.cardBackground,
    alignItems: "center" as const,
  },
  locationPillActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  locationPillText: {
    fontSize: 12,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  locationPillTextActive: {
    color: "#fff",
  },
  consumeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.tint,
  },
  consumeBtnText: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.light.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
  },
  modalBody: {
    padding: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
    marginBottom: 5,
    marginTop: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.cardBackground,
  },
  ratingRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 4,
  },
  confirmBtn: {
    backgroundColor: Colors.light.tint,
    marginHorizontal: 16,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmBtnText: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: "#fff",
  },
});
