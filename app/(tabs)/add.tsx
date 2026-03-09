import React, { useState, useRef, useCallback } from "react";
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
  ScrollView,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { queryClient } from "@/lib/query-client";

const COLOR_OPTIONS = ["Red", "White", "Ros\u00e9", "Sparkling", "Dessert", "Fortified"];
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const FRAME_WIDTH = SCREEN_WIDTH * 0.75;
const FRAME_HEIGHT = FRAME_WIDTH * 1.35;
const CORNER_SIZE = 28;
const CORNER_THICKNESS = 3;

type ScanPhase = "idle" | "camera" | "analyzing" | "results" | "add_form";

interface ScanResult {
  producer: string;
  wine_name: string;
  vintage: string;
  color: string;
  country: string;
  region: string;
  sub_region: string;
  appellation: string;
  varietal: string;
  designation: string;
  vineyard: string;
  size: string;
  cellar_wine_id: number | null;
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

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const hasLaunched = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const resetAll = () => {
    setPhase("idle");
    setPhotoUri(null);
    setScanResult(null);
    setForm({ ...EMPTY_FORM });
    hasLaunched.current = false;
    setIsCapturing(false);
  };

  const openCamera = async () => {
    if (isWeb) {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets[0]?.base64) return;
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      analyzeImage(asset.base64, asset.mimeType || "image/jpeg");
      return;
    }

    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert("Camera access needed", "Please enable camera access in your device settings to scan wine bottles.");
        return;
      }
    }
    setPhase("camera");
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      if (!photo || !photo.base64) {
        setIsCapturing(false);
        return;
      }
      setPhotoUri(photo.uri);
      analyzeImage(photo.base64, "image/jpeg");
    } catch {
      setIsCapturing(false);
      Alert.alert("Error", "Failed to capture photo. Please try again.");
    }
  };

  const analyzeImage = async (base64: string, mimeType: string) => {
    setPhase("analyzing");
    setIsCapturing(false);
    try {
      const baseUrl = getApiUrl();
      const { currentAuthToken } = await import("@/lib/auth-token");
      const authHeaders = currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {};
      const resp = await fetch(new URL("/api/analyze-wine-image", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ image: base64, mimeType }),
      });

      if (!resp.ok) throw new Error("Analysis failed");

      const data = await resp.json();

      const searchResp = await fetch(
        new URL(`/api/wines?search=${encodeURIComponent(data.producer || "")}&inStock=true`, baseUrl).toString(),
        { headers: authHeaders }
      );
      const wines = searchResp.ok ? await searchResp.json() : [];
      const match = wines.find((w: any) =>
        w.producer?.toLowerCase() === (data.producer || "").toLowerCase() &&
        (w.wine_name?.toLowerCase().includes((data.wine_name || "").toLowerCase()) ||
          (data.wine_name || "").toLowerCase().includes(w.wine_name?.toLowerCase()))
      );

      setScanResult({
        producer: data.producer || "",
        wine_name: data.wine_name || "",
        vintage: data.vintage || "",
        color: data.color || "",
        country: data.country || "",
        region: data.region || "",
        sub_region: data.sub_region || "",
        appellation: data.appellation || "",
        varietal: data.varietal || "",
        designation: data.designation || "",
        vineyard: data.vineyard || "",
        size: data.size || "750ml",
        cellar_wine_id: match?.id || null,
      });
      setPhase("results");
    } catch {
      setScanResult(null);
      setPhase("results");
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!hasLaunched.current && phase === "idle") {
        hasLaunched.current = true;
        const timer = setTimeout(() => openCamera(), 400);
        return () => clearTimeout(timer);
      }
      return () => {
        if (phase === "idle") {
          hasLaunched.current = false;
        }
      };
    }, [phase])
  );

  const handleGetInfo = () => {
    if (!scanResult) return;
    const query = `Tell me about ${scanResult.producer} ${scanResult.wine_name}${scanResult.vintage ? ` ${scanResult.vintage}` : ""}`;
    router.navigate({ pathname: "/(tabs)/sommelier", params: { query } });
  };

  const handleViewInCellar = () => {
    if (!scanResult?.cellar_wine_id) return;
    router.push({ pathname: "/wine/[id]", params: { id: String(scanResult.cellar_wine_id) } });
  };

  const handleAddToCellar = () => {
    if (!scanResult) return;
    setForm((prev) => ({
      ...prev,
      producer: scanResult.producer || prev.producer,
      wine_name: scanResult.wine_name || prev.wine_name,
      vintage: scanResult.vintage || prev.vintage,
      color: COLOR_OPTIONS.includes(scanResult.color) ? scanResult.color : prev.color,
      country: scanResult.country || prev.country,
      region: scanResult.region || prev.region,
      sub_region: scanResult.sub_region || prev.sub_region,
      appellation: scanResult.appellation || prev.appellation,
      varietal: scanResult.varietal || prev.varietal,
      designation: scanResult.designation || prev.designation,
      vineyard: scanResult.vineyard || prev.vineyard,
      size: scanResult.size || prev.size,
    }));
    setPhase("add_form");
  };

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
      resetAll();
      router.navigate("/(tabs)");
    },
    onError: (err) => {
      Alert.alert("Error", err.message);
    },
  });

  const canSubmit = form.producer.trim() !== "" && form.wine_name.trim() !== "";

  if (phase === "idle") {
    return (
      <View style={styles.screen}>
        <View style={[styles.centered, { paddingTop: isWeb ? 67 : insets.top + 40, paddingBottom: isWeb ? 84 + 34 : insets.bottom + 80 }]}>
          <View style={styles.cameraIconCircle}>
            <Ionicons name="camera" size={48} color={Colors.light.tint} />
          </View>
          <Text style={styles.idleTitle}>Scan a Wine Label</Text>
          <Text style={styles.idleText}>Take a photo of a wine bottle label to identify it</Text>
          <Pressable style={styles.scanBtn} onPress={openCamera} testID="open-camera">
            <Ionicons name="camera" size={22} color="#fff" />
            <Text style={styles.scanBtnText}>Open Camera</Text>
          </Pressable>
          <Pressable style={styles.manualEntryBtnOutline} onPress={() => setPhase("add_form")} testID="enter-manually-idle">
            <Ionicons name="create-outline" size={18} color={Colors.light.tint} />
            <Text style={styles.manualEntryBtnOutlineText}>Enter Manually</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (phase === "camera") {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        >
          <View style={styles.cameraOverlay}>
            <View style={[styles.cameraTopBar, { paddingTop: insets.top + 8 }]}>
              <Pressable onPress={resetAll} style={styles.cameraCloseBtn}>
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
              <Text style={styles.cameraTitle}>Scan Wine Label</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.cameraFrameContainer}>
              <View style={styles.cameraFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.cameraHint}>Align the wine label within the frame</Text>
            </View>

            <View style={[styles.cameraBottomBar, { paddingBottom: insets.bottom + 90 }]}>
              <Pressable
                style={styles.manualEntryBtn}
                onPress={() => setPhase("add_form")}
                testID="enter-manually"
              >
                <Ionicons name="create-outline" size={20} color="#fff" />
                <Text style={styles.manualEntryText}>Enter Manually</Text>
              </Pressable>

              <Pressable
                style={styles.captureBtn}
                onPress={capturePhoto}
                disabled={isCapturing}
                testID="capture-photo"
              >
                <View style={styles.captureBtnInner}>
                  {isCapturing ? (
                    <ActivityIndicator color={Colors.light.tint} />
                  ) : null}
                </View>
              </Pressable>

              <View style={{ width: 80 }} />
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  if (phase === "analyzing") {
    return (
      <View style={styles.screen}>
        <View style={[styles.centered, { paddingTop: isWeb ? 67 : insets.top + 40 }]}>
          {photoUri && (
            <Image source={{ uri: photoUri }} style={styles.analyzePhoto} resizeMode="cover" />
          )}
          <ActivityIndicator size="large" color={Colors.light.tint} style={{ marginTop: 24 }} />
          <Text style={styles.analyzingLabel}>Analyzing wine label...</Text>
        </View>
      </View>
    );
  }

  if (phase === "results") {
    return (
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={[
            styles.resultsContent,
            { paddingTop: isWeb ? 67 + 16 : insets.top + 16, paddingBottom: isWeb ? 84 + 34 : insets.bottom + 90 },
          ]}
        >
          {photoUri && (
            <View style={styles.resultsPhotoRow}>
              <Image source={{ uri: photoUri }} style={styles.resultsPhoto} resizeMode="cover" />
            </View>
          )}

          {scanResult ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultProducer}>{scanResult.producer}</Text>
              <Text style={styles.resultWine}>
                {scanResult.wine_name}
                {scanResult.vintage ? ` ${scanResult.vintage}` : ""}
              </Text>
              {(scanResult.region || scanResult.varietal) ? (
                <Text style={styles.resultMeta}>
                  {[scanResult.region, scanResult.varietal].filter(Boolean).join(" \u00B7 ")}
                </Text>
              ) : null}
              {scanResult.color ? (
                <View style={styles.resultColorRow}>
                  <View style={styles.resultColorChip}>
                    <Text style={styles.resultColorText}>{scanResult.color}</Text>
                  </View>
                  {scanResult.country ? (
                    <Text style={styles.resultCountry}>{scanResult.country}</Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.resultCard}>
              <Ionicons name="alert-circle-outline" size={32} color={Colors.light.textSecondary} />
              <Text style={styles.noResultTitle}>Could not identify wine</Text>
              <Text style={styles.noResultText}>Try taking another photo or add the wine manually</Text>
            </View>
          )}

          <View style={styles.actionsContainer}>
            {scanResult ? (
              <>
                <Pressable style={styles.actionBtn} onPress={handleGetInfo} testID="get-info">
                  <View style={[styles.actionIcon, { backgroundColor: "#EDE7F6" }]}>
                    <Ionicons name="sparkles" size={20} color="#7B1FA2" />
                  </View>
                  <View style={styles.actionContent}>
                    <Text style={styles.actionTitle}>Get Info</Text>
                    <Text style={styles.actionSub}>Ask the sommelier about this wine</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.light.tabIconDefault} />
                </Pressable>

                {scanResult.cellar_wine_id ? (
                  <Pressable style={styles.actionBtn} onPress={handleViewInCellar} testID="view-in-cellar">
                    <View style={[styles.actionIcon, { backgroundColor: "#E8F5E9" }]}>
                      <Ionicons name="wine" size={20} color="#2E7D32" />
                    </View>
                    <View style={styles.actionContent}>
                      <Text style={styles.actionTitle}>View in Cellar</Text>
                      <Text style={styles.actionSub}>Already in your collection</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.light.tabIconDefault} />
                  </Pressable>
                ) : null}

                <Pressable style={styles.actionBtn} onPress={handleAddToCellar} testID="add-to-cellar">
                  <View style={[styles.actionIcon, { backgroundColor: "#F3E8E9" }]}>
                    <Ionicons name="add-circle" size={20} color={Colors.light.tint} />
                  </View>
                  <View style={styles.actionContent}>
                    <Text style={styles.actionTitle}>Add to Cellar</Text>
                    <Text style={styles.actionSub}>Save this bottle to your collection</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.light.tabIconDefault} />
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.actionBtn} onPress={() => { setPhase("add_form"); }}>
                <View style={[styles.actionIcon, { backgroundColor: "#F3E8E9" }]}>
                  <Ionicons name="create" size={20} color={Colors.light.tint} />
                </View>
                <View style={styles.actionContent}>
                  <Text style={styles.actionTitle}>Add Manually</Text>
                  <Text style={styles.actionSub}>Enter wine details by hand</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.light.tabIconDefault} />
              </Pressable>
            )}
          </View>

          <View style={styles.bottomActions}>
            <Pressable style={styles.retakeBtn} onPress={() => { resetAll(); setTimeout(openCamera, 200); }} testID="retake-photo">
              <Ionicons name="camera" size={18} color={Colors.light.tint} />
              <Text style={styles.retakeBtnText}>Scan Another</Text>
            </Pressable>
            <Pressable style={styles.cancelBtnSmall} onPress={resetAll}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <Pressable onPress={() => setPhase(scanResult ? "results" : "idle")} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.light.tint} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Add to Cellar</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAwareScrollViewCompat
        bottomOffset={100}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: isWeb ? 84 + 34 : insets.bottom + 100 }}
      >
        <FormSection title="Wine Identity">
          <FormField label="Producer *">
            <TextInput style={styles.input} value={form.producer} onChangeText={(v) => update("producer", v)} placeholder="e.g., Ch\u00e2teau Margaux" placeholderTextColor={Colors.light.tabIconDefault} />
          </FormField>
          <FormField label="Wine Name *">
            <TextInput style={styles.input} value={form.wine_name} onChangeText={(v) => update("wine_name", v)} placeholder="e.g., Grand Vin" placeholderTextColor={Colors.light.tabIconDefault} />
          </FormField>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField label="Vintage">
                <TextInput style={styles.input} value={form.vintage} onChangeText={(v) => update("vintage", v)} placeholder="2020" placeholderTextColor={Colors.light.tabIconDefault} keyboardType="number-pad" />
              </FormField>
            </View>
            <View style={styles.halfField}>
              <FormField label="Color">
                <View style={styles.colorChips}>
                  {COLOR_OPTIONS.map((c) => (
                    <Pressable key={c} style={[styles.colorChip, form.color === c && styles.colorChipActive]} onPress={() => update("color", c)}>
                      <Text style={[styles.colorChipText, form.color === c && styles.colorChipTextActive]}>{c}</Text>
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
                <Pressable key={opt} style={[styles.locationOption, form.location === opt && styles.locationOptionActive]} onPress={() => update("location", form.location === opt ? "" : opt)}>
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
          <Pressable style={styles.cancelBtnOutline} onPress={() => setPhase(scanResult ? "results" : "idle")}>
            <Text style={styles.cancelOutlineText}>Cancel</Text>
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
  centered: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 32,
  },
  cameraIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#F3E8E9",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 24,
  },
  idleTitle: {
    fontSize: 22,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
    marginBottom: 8,
  },
  idleText: {
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center" as const,
    marginBottom: 32,
  },
  scanBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
  },
  scanBtnText: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: "#fff",
  },
  analyzePhoto: {
    width: 140,
    height: 190,
    borderRadius: 12,
  },
  analyzingLabel: {
    fontSize: 16,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
    marginTop: 16,
  },
  resultsContent: {
    padding: 16,
  },
  resultsPhotoRow: {
    alignItems: "center" as const,
    marginBottom: 16,
  },
  resultsPhoto: {
    width: 100,
    height: 140,
    borderRadius: 10,
  },
  resultCard: {
    backgroundColor: Colors.light.white,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 16,
  },
  resultProducer: {
    fontSize: 20,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
  },
  resultWine: {
    fontSize: 15,
    fontFamily: "LibreBaskerville_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  resultMeta: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 8,
  },
  resultColorRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 10,
  },
  resultColorChip: {
    backgroundColor: "#F3E8E9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  resultColorText: {
    fontSize: 12,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  resultCountry: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  noResultTitle: {
    fontSize: 17,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
    marginTop: 8,
  },
  noResultText: {
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  actionsContainer: {
    gap: 8,
    marginBottom: 16,
  },
  actionBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.light.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: 14,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
  },
  actionSub: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  bottomActions: {
    flexDirection: "row" as const,
    gap: 12,
  },
  retakeBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.tint,
  },
  retakeBtnText: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  cancelBtnSmall: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.textSecondary,
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
  backBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    width: 60,
  },
  backText: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
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
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.cardBackground,
  },
  textArea: {
    minHeight: 70,
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
    gap: 4,
  },
  colorChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  colorChipActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  colorChipText: {
    fontSize: 11,
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
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center" as const,
    backgroundColor: Colors.light.cardBackground,
  },
  locationOptionActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  locationOptionText: {
    fontSize: 14,
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
  cancelBtnOutline: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.white,
  },
  cancelOutlineText: {
    fontSize: 16,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.textSecondary,
  },
  manualEntryBtnOutline: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.light.tint,
  },
  manualEntryBtnOutlineText: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: "space-between" as const,
  },
  cameraTopBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cameraCloseBtn: {
    width: 40,
    height: 40,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cameraTitle: {
    fontSize: 17,
    fontFamily: "Outfit_600SemiBold",
    color: "#fff",
  },
  cameraFrameContainer: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  cameraFrame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    position: "relative" as const,
  },
  corner: {
    position: "absolute" as const,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: "rgba(255,255,255,0.8)",
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: "rgba(255,255,255,0.8)",
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderColor: "rgba(255,255,255,0.8)",
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderColor: "rgba(255,255,255,0.8)",
    borderBottomRightRadius: 8,
  },
  cameraHint: {
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: "rgba(255,255,255,0.7)",
    textAlign: "center" as const,
    marginTop: 16,
  },
  cameraBottomBar: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 24,
  },
  manualEntryBtn: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    width: 80,
    gap: 4,
  },
  manualEntryText: {
    fontSize: 12,
    fontFamily: "Outfit_500Medium",
    color: "#fff",
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: "#fff",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 3,
  },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
});
