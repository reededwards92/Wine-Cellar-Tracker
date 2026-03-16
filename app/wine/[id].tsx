import React, { useState, useRef } from "react";
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
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router, useFocusEffect } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import { getColorDot, getDrinkWindowStatus } from "@/lib/api";
import { apiRequest, queryClient } from "@/lib/query-client";
import CruInsightBanner from "@/components/CruInsightBanner";
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

interface StorageLocation {
  name: string;
  type: string;
}

function BottleCard({ bottle, onConsume, onLocationChange, storageLocations }: { bottle: Bottle; onConsume: () => void; onLocationChange: (location: string | null) => void; storageLocations: string[] }) {
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
      {bottle.status === "in_cellar" && storageLocations.length > 0 ? (
        <View style={styles.locationPickerRow}>
          {storageLocations.map((opt) => (
            <Pressable
              key={opt}
              style={[styles.locationPill, bottle.location === opt && styles.locationPillActive]}
              onPress={() => onLocationChange(bottle.location === opt ? null : opt)}
            >
              <Text style={[styles.locationPillText, bottle.location === opt && styles.locationPillTextActive]}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      ) : bottle.status === "in_cellar" ? (
        <Text style={styles.bottleMeta}>
          <Ionicons name="location-outline" size={12} color={Colors.light.textSecondary} /> No locations set up
        </Text>
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
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    quantity: 1,
    location: "",
    purchase_price: "",
    estimated_value: "",
    size: "750ml",
  });
  const [undoToast, setUndoToast] = useState<{ bottle_id: number; message: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoFadeAnim = useRef(new Animated.Value(0)).current;

  const showUndoToast = (data: { bottle_id: number; message: string }) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(data);
    Animated.timing(undoFadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
    undoTimerRef.current = setTimeout(() => {
      Animated.timing(undoFadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setUndoToast(null));
    }, 10000);
  };

  const handleUndo = async () => {
    if (!undoToast) return;
    const bottleId = undoToast.bottle_id;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    Animated.timing(undoFadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setUndoToast(null));
    try {
      await apiRequest("POST", "/api/consumption/undo", { bottle_id: bottleId });
      queryClient.invalidateQueries({ queryKey: ["/api/wines", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption/stats"] });
    } catch {
      Alert.alert("Error", "Failed to undo consumption");
    }
  };

  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    producer: "",
    wine_name: "",
    vintage: "",
    color: "",
    varietal: "",
    country: "",
    region: "",
    sub_region: "",
    appellation: "",
    designation: "",
    vineyard: "",
    drink_window_start: "",
    drink_window_end: "",
  });

  const { data: wine, isLoading } = useQuery<WineDetail>({
    queryKey: ["/api/wines", id],
  });

  const { data: storageLocs } = useQuery<StorageLocation[]>({
    queryKey: ["/api/storage-locations"],
  });

  const { data: wineInsight, isLoading: insightLoading } = useQuery<{ insight: string }>({
    queryKey: ["wine-insight", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/wines/${id}/insight`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
    enabled: !!wine,
  });

  const locationNames = (storageLocs || []).map((l) => l.name);

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
      const bottleId = consumeBottleId!;
      setConsumeModal(false);
      setConsumeForm({ occasion: "", paired_with: "", who_with: "", rating: 0, tasting_notes: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/wines", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption/stats"] });
      showUndoToast({
        bottle_id: bottleId,
        message: `Marked as consumed.`,
      });
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
    onMutate: async ({ bottleId, location }) => {
      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/wines", id] });
      const previous = queryClient.getQueryData<WineDetail>(["/api/wines", id]);
      // Optimistically update the bottle location immediately
      queryClient.setQueryData(["/api/wines", id], (old: WineDetail | undefined) => {
        if (!old) return old;
        return {
          ...old,
          bottles: old.bottles?.map((b) =>
            b.id === bottleId ? { ...b, location } : b
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Revert to the previous state on error
      if (context?.previous) {
        queryClient.setQueryData(["/api/wines", id], context.previous);
      }
      Alert.alert("Error", "Failed to update location");
    },
  });

  const addBottlesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/wines/${id}/bottles`, {
        quantity: addForm.quantity,
        location: addForm.location || null,
        purchase_price: addForm.purchase_price ? parseFloat(addForm.purchase_price) : null,
        estimated_value: addForm.estimated_value ? parseFloat(addForm.estimated_value) : null,
        size: addForm.size,
      });
      return res.json();
    },
    onSuccess: () => {
      setAddModal(false);
      setAddForm({ quantity: 1, location: "", purchase_price: "", estimated_value: "", size: "750ml" });
      queryClient.invalidateQueries({ queryKey: ["/api/wines", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message);
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, any> = {};
      if (editForm.producer) body.producer = editForm.producer;
      if (editForm.wine_name) body.wine_name = editForm.wine_name;
      body.vintage = editForm.vintage ? parseInt(editForm.vintage, 10) : null;
      if (editForm.color) body.color = editForm.color;
      body.varietal = editForm.varietal || null;
      body.country = editForm.country || null;
      body.region = editForm.region || null;
      body.sub_region = editForm.sub_region || null;
      body.appellation = editForm.appellation || null;
      body.designation = editForm.designation || null;
      body.vineyard = editForm.vineyard || null;
      body.drink_window_start = editForm.drink_window_start ? parseInt(editForm.drink_window_start, 10) : null;
      body.drink_window_end = editForm.drink_window_end ? parseInt(editForm.drink_window_end, 10) : null;
      const res = await apiRequest("PUT", `/api/wines/${id}`, body);
      return res.json();
    },
    onSuccess: () => {
      setEditModal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/wines", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message);
    },
  });

  const openEditModal = () => {
    if (!wine) return;
    setEditForm({
      producer: wine.producer || "",
      wine_name: wine.wine_name || "",
      vintage: wine.vintage ? String(wine.vintage) : "",
      color: wine.color || "",
      varietal: wine.varietal || "",
      country: wine.country || "",
      region: wine.region || "",
      sub_region: wine.sub_region || "",
      appellation: wine.appellation || "",
      designation: wine.designation || "",
      vineyard: wine.vineyard || "",
      drink_window_start: wine.drink_window_start != null ? String(wine.drink_window_start) : "",
      drink_window_end: wine.drink_window_end != null ? String(wine.drink_window_end) : "",
    });
    setEditModal(true);
  };

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
    <LinearGradient
      colors={[Colors.light.bgGradientStart, Colors.light.bgGradientEnd]}
      style={styles.screen}
    >
      <View style={[styles.navBar, { paddingTop: isWeb ? 67 : insets.top }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.tint} />
        </Pressable>
        <Text style={styles.navTitle} numberOfLines={1}>Wine Details</Text>
        <Pressable onPress={openEditModal} style={styles.editBtn} hitSlop={8}>
          <Ionicons name="create-outline" size={22} color={Colors.light.tint} />
        </Pressable>
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
              <Text style={styles.scoreValue}>{Math.round(wine.ct_community_score)}</Text>
              <Text style={styles.scoreLabel}>Community</Text>
            </View>
          ) : null}
        </View>

        <CruInsightBanner
          insight={wineInsight?.insight ?? null}
          isLoading={insightLoading}
        />

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
          {(wine.drink_window_start != null || wine.drink_window_end != null) ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Drink Window</Text>
              <View style={styles.dwRow}>
                <View style={[styles.dwDotSm, { backgroundColor: dwColor }]} />
                <Text style={[styles.infoValue, { color: dwColor }]}>
                  {wine.drink_window_start != null && wine.drink_window_end != null
                    ? `${wine.drink_window_start}–${wine.drink_window_end}`
                    : wine.drink_window_start != null
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
              storageLocations={locationNames}
              onConsume={() => {
                setConsumeBottleId(bottle.id);
                setConsumeModal(true);
              }}
              onLocationChange={(location) => locationMutation.mutate({ bottleId: bottle.id, location })}
            />
          ))}
          <Pressable style={styles.addBottlesBtn} onPress={() => setAddModal(true)}>
            <Ionicons name="add-circle-outline" size={18} color={Colors.light.tint} />
            <Text style={styles.addBottlesBtnText}>Add More Bottles</Text>
          </Pressable>
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
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Paired With</Text>
              <TextInput
                style={styles.modalInput}
                value={consumeForm.paired_with}
                onChangeText={(v) => setConsumeForm((p) => ({ ...p, paired_with: v }))}
                placeholder="Grilled steak, cheese..."
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Who With</Text>
              <TextInput
                style={styles.modalInput}
                value={consumeForm.who_with}
                onChangeText={(v) => setConsumeForm((p) => ({ ...p, who_with: v }))}
                placeholder="Friends, family..."
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Tasting Notes</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 80 }]}
                value={consumeForm.tasting_notes}
                onChangeText={(v) => setConsumeForm((p) => ({ ...p, tasting_notes: v }))}
                placeholder="Describe the wine..."
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
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

      <Modal visible={addModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Bottles</Text>
              <Pressable onPress={() => setAddModal(false)}>
                <Ionicons name="close" size={24} color={Colors.light.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalLabel}>Quantity</Text>
              <View style={styles.quantityRow}>
                <Pressable
                  style={styles.quantityBtn}
                  onPress={() => setAddForm((p) => ({ ...p, quantity: Math.max(1, p.quantity - 1) }))}
                >
                  <Ionicons name="remove" size={20} color={Colors.light.tint} />
                </Pressable>
                <Text style={styles.quantityNum}>{addForm.quantity}</Text>
                <Pressable
                  style={styles.quantityBtn}
                  onPress={() => setAddForm((p) => ({ ...p, quantity: Math.min(24, p.quantity + 1) }))}
                >
                  <Ionicons name="add" size={20} color={Colors.light.tint} />
                </Pressable>
              </View>

              {locationNames.length > 0 ? (
                <>
                  <Text style={styles.modalLabel}>Location</Text>
                  <View style={styles.locationPickerRow}>
                    {locationNames.map((opt) => (
                      <Pressable
                        key={opt}
                        style={[styles.locationPill, addForm.location === opt && styles.locationPillActive]}
                        onPress={() => setAddForm((p) => ({ ...p, location: p.location === opt ? "" : opt }))}
                      >
                        <Text style={[styles.locationPillText, addForm.location === opt && styles.locationPillTextActive]}>{opt}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              <Text style={styles.modalLabel}>Purchase Price</Text>
              <TextInput
                style={styles.modalInput}
                value={addForm.purchase_price}
                onChangeText={(v) => setAddForm((p) => ({ ...p, purchase_price: v }))}
                placeholder="$0.00"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
                keyboardType="decimal-pad"
              />

              <Text style={styles.modalLabel}>Estimated Value</Text>
              <TextInput
                style={styles.modalInput}
                value={addForm.estimated_value}
                onChangeText={(v) => setAddForm((p) => ({ ...p, estimated_value: v }))}
                placeholder="$0.00"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
                keyboardType="decimal-pad"
              />

              <Text style={styles.modalLabel}>Bottle Size</Text>
              <View style={styles.locationPickerRow}>
                {["375ml", "750ml", "1.5L", "3L"].map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.locationPill, addForm.size === s && styles.locationPillActive]}
                    onPress={() => setAddForm((p) => ({ ...p, size: s }))}
                  >
                    <Text style={[styles.locationPillText, addForm.size === s && styles.locationPillTextActive]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            <Pressable
              style={styles.confirmBtn}
              onPress={() => addBottlesMutation.mutate()}
              disabled={addBottlesMutation.isPending}
            >
              {addBottlesMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>Add {addForm.quantity} Bottle{addForm.quantity !== 1 ? "s" : ""}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={editModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16, maxHeight: "90%" }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Wine</Text>
              <Pressable onPress={() => setEditModal(false)}>
                <Ionicons name="close" size={24} color={Colors.light.text} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalLabel}>Producer</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.producer}
                onChangeText={(v) => setEditForm((p) => ({ ...p, producer: v }))}
                placeholder="Producer"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Wine Name</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.wine_name}
                onChangeText={(v) => setEditForm((p) => ({ ...p, wine_name: v }))}
                placeholder="Wine name"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Vintage</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.vintage}
                onChangeText={(v) => setEditForm((p) => ({ ...p, vintage: v }))}
                placeholder="e.g. 2020"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
                keyboardType="number-pad"
              />

              <Text style={styles.modalLabel}>Color</Text>
              <View style={styles.locationPickerRow}>
                {["Red", "White", "Rosé", "Sparkling", "Dessert", "Fortified"].map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.locationPill, editForm.color === c && styles.locationPillActive]}
                    onPress={() => setEditForm((p) => ({ ...p, color: c }))}
                  >
                    <Text style={[styles.locationPillText, editForm.color === c && styles.locationPillTextActive]}>{c}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.modalLabel}>Varietal</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.varietal}
                onChangeText={(v) => setEditForm((p) => ({ ...p, varietal: v }))}
                placeholder="e.g. Cabernet Sauvignon"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Country</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.country}
                onChangeText={(v) => setEditForm((p) => ({ ...p, country: v }))}
                placeholder="e.g. France"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Region</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.region}
                onChangeText={(v) => setEditForm((p) => ({ ...p, region: v }))}
                placeholder="e.g. Napa Valley"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Sub-Region</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.sub_region}
                onChangeText={(v) => setEditForm((p) => ({ ...p, sub_region: v }))}
                placeholder="e.g. Oakville"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Appellation</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.appellation}
                onChangeText={(v) => setEditForm((p) => ({ ...p, appellation: v }))}
                placeholder="Appellation"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
              />

              <Text style={styles.modalLabel}>Drink Window Start</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.drink_window_start}
                onChangeText={(v) => setEditForm((p) => ({ ...p, drink_window_start: v }))}
                placeholder="e.g. 2024"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
                keyboardType="number-pad"
              />

              <Text style={styles.modalLabel}>Drink Window End</Text>
              <TextInput
                style={styles.modalInput}
                value={editForm.drink_window_end}
                onChangeText={(v) => setEditForm((p) => ({ ...p, drink_window_end: v }))}
                placeholder="e.g. 2030"
                placeholderTextColor="rgba(114, 47, 55, 0.38)"
                keyboardType="number-pad"
              />
            </ScrollView>

            <Pressable
              style={styles.confirmBtn}
              onPress={() => editMutation.mutate()}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>Save Changes</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      {undoToast ? (
        <Animated.View style={[styles.undoToast, { opacity: undoFadeAnim }]}>
          <Ionicons name="wine-outline" size={18} color="#FFFFFF" />
          <Text style={styles.undoToastText} numberOfLines={2}>
            {undoToast.message}
          </Text>
          <Pressable onPress={handleUndo} style={styles.undoButton}>
            <Text style={styles.undoButtonText}>Undo</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
    backgroundColor: "transparent",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  navTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    textAlign: "center",
  },
  scrollContent: {
    padding: 16,
  },
  wineHeader: {
    backgroundColor: Colors.light.glassBg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: Colors.light.glassBorder,
    padding: 20,
    ...theme.shadows.glass,
    alignItems: "center",
    marginBottom: 12,
    overflow: "hidden" as const,
  },
  colorDotLg: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginBottom: 10,
  },
  producer: {
    fontSize: 22,
    fontFamily: "LibreBaskerville_400Regular",
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
    backgroundColor: "rgba(255,255,255,0.65)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: "center",
  },
  scoreValue: {
    fontSize: 18,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.textSecondary,
  },
  scoreLabel: {
    fontSize: 11,
    fontFamily: "Outfit_400Regular",
    color: "rgba(45,18,21,0.55)",
  },
  detailSection: {
    backgroundColor: Colors.light.glassBg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: Colors.light.glassBorder,
    padding: 16,
    ...theme.shadows.glass,
    marginBottom: 12,
    overflow: "hidden" as const,
  },
  detailSectionTitle: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: "rgba(114, 47, 55, 0.55)",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(114, 47, 55, 0.07)",
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: "rgba(45, 18, 21, 0.50)",
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
    backgroundColor: "rgba(255,255,255,0.40)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(114, 47, 55, 0.07)",
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
    flexWrap: "wrap" as const,
    gap: 6,
    marginTop: 6,
  },
  locationPill: {
    minWidth: 60,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(114, 47, 55, 0.18)",
    backgroundColor: "rgba(255,255,255,0.55)",
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
    borderColor: "rgba(114, 47, 55, 0.35)",
    backgroundColor: "rgba(114, 47, 55, 0.06)",
  },
  consumeBtnText: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.light.scrim,
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.light.glassBgStrong,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    overflow: "hidden" as const,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(114, 47, 55, 0.10)",
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
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    marginBottom: 5,
    marginTop: 12,
  },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(114, 47, 55, 0.18)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: "rgba(255, 255, 255, 0.60)",
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
  addBottlesBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 8,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: Colors.light.tint + "10",
    borderWidth: 1,
    borderColor: Colors.light.tint + "40",
  },
  addBottlesBtnText: {
    fontSize: 14,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingVertical: 8,
  },
  quantityBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityNum: {
    fontSize: 24,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
    minWidth: 40,
    textAlign: "center",
  },
  undoToast: {
    position: "absolute" as const,
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  undoToastText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: "#FFFFFF",
  },
  undoButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  undoButtonText: {
    fontSize: 14,
    fontFamily: "Outfit_600SemiBold",
    color: "#FFFFFF",
  },
});
