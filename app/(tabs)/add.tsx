import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { queryClient } from "@/lib/query-client";

const COLOR_OPTIONS = ["Red", "White", "Rosé", "Sparkling", "Dessert", "Fortified"];

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const EMPTY_FORM = {
  producer: "",
  wine_name: "",
  vintage: "",
  color: "Red",
  country: "",
  region: "",
  sub_region: "",
  appellation: "",
  varietal: "",
  designation: "",
  vineyard: "",
  drink_window_start: "",
  drink_window_end: "",
  ct_community_score: "",
  quantity: "1",
  purchase_date: "",
  purchase_price: "",
  estimated_value: "",
  location: "",
  size: "750ml",
  notes: "",
};

export default function AddWineScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [analyzing, setAnalyzing] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const hasLaunched = useRef(false);

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const launchCamera = async () => {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.status !== "granted") {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Camera access needed", "Please enable camera access in your device settings to scan wine bottles.");
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]?.base64) return;

    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    setAnalyzing(true);

    try {
      const baseUrl = getApiUrl();
      const resp = await fetch(new URL("/api/analyze-wine-image", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: asset.base64,
          mimeType: asset.mimeType || "image/jpeg",
        }),
      });

      if (!resp.ok) throw new Error("Analysis failed");

      const data = await resp.json();
      setForm((prev) => ({
        ...prev,
        producer: data.producer || prev.producer,
        wine_name: data.wine_name || prev.wine_name,
        vintage: data.vintage || prev.vintage,
        color: COLOR_OPTIONS.includes(data.color) ? data.color : prev.color,
        country: data.country || prev.country,
        region: data.region || prev.region,
        sub_region: data.sub_region || prev.sub_region,
        appellation: data.appellation || prev.appellation,
        varietal: data.varietal || prev.varietal,
        designation: data.designation || prev.designation,
        vineyard: data.vineyard || prev.vineyard,
        size: data.size || prev.size,
      }));
    } catch {
      Alert.alert("Could not analyze", "The image could not be analyzed. You can fill in the details manually or try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!hasLaunched.current) {
        hasLaunched.current = true;
        const timer = setTimeout(() => launchCamera(), 400);
        return () => clearTimeout(timer);
      }
    }, [])
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        producer: form.producer,
        wine_name: form.wine_name,
        vintage: form.vintage ? parseInt(form.vintage) : null,
        color: form.color,
        country: form.country || null,
        region: form.region || null,
        sub_region: form.sub_region || null,
        appellation: form.appellation || null,
        varietal: form.varietal || null,
        designation: form.designation || null,
        vineyard: form.vineyard || null,
        drink_window_start: form.drink_window_start ? parseInt(form.drink_window_start) : null,
        drink_window_end: form.drink_window_end ? parseInt(form.drink_window_end) : null,
        ct_community_score: form.ct_community_score ? parseFloat(form.ct_community_score) : null,
        quantity: parseInt(form.quantity) || 1,
        purchase_date: form.purchase_date || null,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : null,
        estimated_value: form.estimated_value ? parseFloat(form.estimated_value) : null,
        location: form.location || null,
        size: form.size || "750ml",
        notes: form.notes || null,
      };
      const res = await apiRequest("POST", "/api/wines", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filters"] });
      setForm({ ...EMPTY_FORM });
      setPhotoUri(null);
      hasLaunched.current = false;
      router.navigate("/(tabs)");
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  const canSubmit = form.producer.trim() !== "" && form.wine_name.trim() !== "";

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <Text style={styles.title}>Add Wine</Text>
        <Pressable onPress={launchCamera} disabled={analyzing} style={styles.retakeButton} testID="retake-photo">
          <Ionicons name="camera" size={22} color={Colors.light.tint} />
          <Text style={styles.retakeText}>Scan</Text>
        </Pressable>
      </View>

      {analyzing && (
        <View style={styles.analyzingBanner}>
          <ActivityIndicator size="small" color={Colors.light.tint} />
          <Text style={styles.analyzingText}>Analyzing wine label...</Text>
        </View>
      )}

      <KeyboardAwareScrollViewCompat
        bottomOffset={100}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: isWeb ? 84 + 34 : insets.bottom + 100 }}
      >
        {photoUri && (
          <View style={styles.photoSection}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
          </View>
        )}

        <FormSection title="Wine Identity">
          <FormField label="Producer *">
            <TextInput
              style={styles.input}
              value={form.producer}
              onChangeText={(v) => update("producer", v)}
              placeholder="e.g., Château Margaux"
              placeholderTextColor={Colors.light.tabIconDefault}
            />
          </FormField>
          <FormField label="Wine Name *">
            <TextInput
              style={styles.input}
              value={form.wine_name}
              onChangeText={(v) => update("wine_name", v)}
              placeholder="e.g., Grand Vin"
              placeholderTextColor={Colors.light.tabIconDefault}
            />
          </FormField>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Vintage">
                <TextInput
                  style={styles.input}
                  value={form.vintage}
                  onChangeText={(v) => update("vintage", v)}
                  placeholder="2020"
                  placeholderTextColor={Colors.light.tabIconDefault}
                  keyboardType="number-pad"
                />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Color">
                <View style={styles.colorChips}>
                  {COLOR_OPTIONS.map((c) => (
                    <Pressable
                      key={c}
                      style={[styles.colorChip, form.color === c && styles.colorChipActive]}
                      onPress={() => update("color", c)}
                    >
                      <Text style={[styles.colorChipText, form.color === c && styles.colorChipTextActive]}>
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </FormField>
            </View>
          </View>
        </FormSection>

        <FormSection title="Origin">
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Country">
                <TextInput style={styles.input} value={form.country} onChangeText={(v) => update("country", v)} placeholder="France" placeholderTextColor={Colors.light.tabIconDefault} />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Region">
                <TextInput style={styles.input} value={form.region} onChangeText={(v) => update("region", v)} placeholder="Bordeaux" placeholderTextColor={Colors.light.tabIconDefault} />
              </FormField>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Sub-Region">
                <TextInput style={styles.input} value={form.sub_region} onChangeText={(v) => update("sub_region", v)} placeholder="Margaux" placeholderTextColor={Colors.light.tabIconDefault} />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Appellation">
                <TextInput style={styles.input} value={form.appellation} onChangeText={(v) => update("appellation", v)} placeholder="Margaux AOC" placeholderTextColor={Colors.light.tabIconDefault} />
              </FormField>
            </View>
          </View>
          <FormField label="Varietal">
            <TextInput style={styles.input} value={form.varietal} onChangeText={(v) => update("varietal", v)} placeholder="Cabernet Sauvignon" placeholderTextColor={Colors.light.tabIconDefault} />
          </FormField>
        </FormSection>

        <FormSection title="Details">
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Designation">
                <TextInput style={styles.input} value={form.designation} onChangeText={(v) => update("designation", v)} placeholder="Reserve" placeholderTextColor={Colors.light.tabIconDefault} />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Vineyard">
                <TextInput style={styles.input} value={form.vineyard} onChangeText={(v) => update("vineyard", v)} placeholder="Les Pavots" placeholderTextColor={Colors.light.tabIconDefault} />
              </FormField>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Drink Start">
                <TextInput style={styles.input} value={form.drink_window_start} onChangeText={(v) => update("drink_window_start", v)} placeholder="2024" placeholderTextColor={Colors.light.tabIconDefault} keyboardType="number-pad" />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Drink End">
                <TextInput style={styles.input} value={form.drink_window_end} onChangeText={(v) => update("drink_window_end", v)} placeholder="2030" placeholderTextColor={Colors.light.tabIconDefault} keyboardType="number-pad" />
              </FormField>
            </View>
          </View>
          <FormField label="Community Score">
            <TextInput style={styles.input} value={form.ct_community_score} onChangeText={(v) => update("ct_community_score", v)} placeholder="90.5" placeholderTextColor={Colors.light.tabIconDefault} keyboardType="decimal-pad" />
          </FormField>
        </FormSection>

        <FormSection title="Bottle Info">
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Quantity">
                <TextInput style={styles.input} value={form.quantity} onChangeText={(v) => update("quantity", v)} placeholder="1" placeholderTextColor={Colors.light.tabIconDefault} keyboardType="number-pad" />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Size">
                <TextInput style={styles.input} value={form.size} onChangeText={(v) => update("size", v)} placeholder="750ml" placeholderTextColor={Colors.light.tabIconDefault} />
              </FormField>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Purchase Price">
                <TextInput style={styles.input} value={form.purchase_price} onChangeText={(v) => update("purchase_price", v)} placeholder="$0.00" placeholderTextColor={Colors.light.tabIconDefault} keyboardType="decimal-pad" />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Est. Value">
                <TextInput style={styles.input} value={form.estimated_value} onChangeText={(v) => update("estimated_value", v)} placeholder="$0.00" placeholderTextColor={Colors.light.tabIconDefault} keyboardType="decimal-pad" />
              </FormField>
            </View>
          </View>
          <FormField label="Location">
            <View style={styles.locationRow}>
              {["Rack", "Cabinet", "Fridge"].map((opt) => (
                <Pressable
                  key={opt}
                  style={[styles.locationOption, form.location === opt && styles.locationOptionActive]}
                  onPress={() => update("location", form.location === opt ? "" : opt)}
                >
                  <Text style={[styles.locationOptionText, form.location === opt && styles.locationOptionTextActive]}>{opt}</Text>
                </Pressable>
              ))}
            </View>
          </FormField>
          <FormField label="Notes">
            <TextInput style={[styles.input, styles.textArea]} value={form.notes} onChangeText={(v) => update("notes", v)} placeholder="Tasting notes, purchase details..." placeholderTextColor={Colors.light.tabIconDefault} multiline numberOfLines={3} textAlignVertical="top" />
          </FormField>
        </FormSection>

        <View style={styles.submitContainer}>
          <Pressable
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending}
            testID="add-wine-button"
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text style={styles.submitText}>Add Wine</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.cardBackground,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    justifyContent: "space-between" as const,
  },
  title: {
    fontSize: 28,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
  },
  retakeButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingVertical: 4,
  },
  retakeText: {
    fontSize: 15,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.tint,
  },
  analyzingBanner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 10,
    paddingVertical: 12,
    backgroundColor: "#F3E8E9",
  },
  analyzingText: {
    fontSize: 14,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  photoSection: {
    alignItems: "center" as const,
    paddingVertical: 16,
  },
  photoPreview: {
    width: 120,
    height: 160,
    borderRadius: 10,
  },
  section: {
    backgroundColor: Colors.light.white,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.light.border,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.textSecondary,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  field: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 10,
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.cardBackground,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: "top" as const,
  },
  row: {
    flexDirection: "row" as const,
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  colorChips: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 6,
  },
  colorChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.cardBackground,
  },
  colorChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  colorChipText: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
  },
  colorChipTextActive: {
    color: "#fff",
  },
  locationRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  locationOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.cardBackground,
    alignItems: "center" as const,
  },
  locationOptionActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  locationOptionText: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  locationOptionTextActive: {
    color: "#fff",
  },
  submitContainer: {
    padding: 16,
    marginTop: 8,
  },
  submitBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: "#fff",
  },
});
