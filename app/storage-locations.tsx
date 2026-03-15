import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import { apiRequest, queryClient } from "@/lib/query-client";

interface StorageLocation {
  id?: number;
  name: string;
  type: string;
  sort_order?: number;
}

const STORAGE_TYPES = [
  { type: "rack", label: "Rack", icon: "grid-outline" as const },
  { type: "fridge", label: "Fridge", icon: "snow-outline" as const },
  { type: "cabinet", label: "Cabinet", icon: "file-tray-stacked-outline" as const },
  { type: "closet", label: "Closet", icon: "home-outline" as const },
  { type: "cellar", label: "Cellar", icon: "business-outline" as const },
  { type: "wine_bar", label: "Wine Bar", icon: "wine-outline" as const },
  { type: "garage", label: "Garage", icon: "car-outline" as const },
  { type: "offsite", label: "Off-site", icon: "navigate-outline" as const },
  { type: "other", label: "Other", icon: "ellipsis-horizontal-outline" as const },
];

function getIconForType(type: string): keyof typeof Ionicons.glyphMap {
  const found = STORAGE_TYPES.find((t) => t.type === type);
  return found?.icon || "ellipsis-horizontal-outline";
}

export default function StorageLocationsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [addingType, setAddingType] = useState<string | null>(null);
  const [customName, setCustomName] = useState("");
  const [renames, setRenames] = useState<Record<string, string>>({});

  const { data: savedLocations, isLoading } = useQuery<StorageLocation[]>({
    queryKey: ["/api/storage-locations"],
  });

  useEffect(() => {
    if (savedLocations) {
      setLocations(savedLocations);
    }
  }, [savedLocations]);

  const addLocation = (type: string) => {
    if (type === "other") {
      setAddingType("other");
      setCustomName("");
      return;
    }

    const typeInfo = STORAGE_TYPES.find((t) => t.type === type);
    if (!typeInfo) return;

    const existingCount = locations.filter((l) => l.type === type).length;
    const name = existingCount > 0 ? `${typeInfo.label} ${existingCount + 1}` : typeInfo.label;

    if (existingCount > 0) {
      const updated = locations.map((l) => {
        if (l.type === type && l.name === typeInfo.label) {
          return { ...l, name: `${typeInfo.label} 1` };
        }
        return l;
      });
      setLocations([...updated, { name, type }]);
    } else {
      setLocations([...locations, { name, type }]);
    }
    setHasChanges(true);
  };

  const addCustomLocation = () => {
    if (!customName.trim()) return;
    setLocations([...locations, { name: customName.trim(), type: "other" }]);
    setHasChanges(true);
    setAddingType(null);
    setCustomName("");
  };

  const removeLocation = (index: number) => {
    const loc = locations[index];
    Alert.alert(
      "Remove Location",
      `Remove "${loc.name}"? Any bottles stored there will have their location cleared.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            const updated = [...locations];
            updated.splice(index, 1);

            const sameType = updated.filter((l) => l.type === loc.type);
            if (sameType.length === 1) {
              const typeInfo = STORAGE_TYPES.find((t) => t.type === loc.type);
              if (typeInfo && sameType[0].name.match(new RegExp(`^${typeInfo.label} \\d+$`))) {
                const idx = updated.indexOf(sameType[0]);
                updated[idx] = { ...updated[idx], name: typeInfo.label };
              }
            }

            setLocations(updated);
            setHasChanges(true);
          },
        },
      ]
    );
  };

  const renameLocation = (index: number, newName: string) => {
    const oldName = locations[index].name;
    const updated = [...locations];
    updated[index] = { ...updated[index], name: newName };
    setLocations(updated);
    setHasChanges(true);

    if (savedLocations) {
      const originalName = Object.entries(renames).find(([_, v]) => v === oldName)?.[0] || oldName;
      const wasSaved = savedLocations.some((l) => l.name === originalName);
      if (wasSaved) {
        setRenames((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key] === oldName) delete next[key];
          }
          next[originalName] = newName;
          return next;
        });
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiRequest("PUT", "/api/storage-locations", {
        locations: locations.map((l, i) => ({ name: l.name, type: l.type, sort_order: i })),
        renames,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/storage-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      setHasChanges(false);
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.light.tint} />
          </Pressable>
          <Text style={styles.title}>Storage Locations</Text>
          <View style={{ width: 60 }}>
            {hasChanges ? (
              <Pressable onPress={handleSave} disabled={saving} style={styles.saveBtn}>
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.light.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: isWeb ? 34 + 20 : insets.bottom + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>YOUR LOCATIONS</Text>
            {locations.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="location-outline" size={32} color={Colors.light.tabIconDefault} />
                <Text style={styles.emptyText}>No storage locations set up yet</Text>
                <Text style={styles.emptySubtext}>Add locations below to organize your cellar</Text>
              </View>
            ) : (
              <View style={styles.locationsList}>
                {locations.map((loc, idx) => (
                  <View key={`${loc.type}-${idx}`} style={styles.locationRow}>
                    <View style={styles.locationIcon}>
                      <Ionicons name={getIconForType(loc.type)} size={18} color={Colors.light.tint} />
                    </View>
                    <TextInput
                      style={styles.locationNameInput}
                      value={loc.name}
                      onChangeText={(val) => renameLocation(idx, val)}
                      placeholder="Location name"
                      placeholderTextColor={Colors.light.tabIconDefault}
                    />
                    <Pressable onPress={() => removeLocation(idx)} hitSlop={8} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={20} color={Colors.light.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>ADD LOCATION</Text>
            <View style={styles.typesGrid}>
              {STORAGE_TYPES.map((st) => (
                <Pressable
                  key={st.type}
                  style={({ pressed }) => [styles.typeCard, pressed && styles.typeCardPressed]}
                  onPress={() => addLocation(st.type)}
                >
                  <Ionicons name={st.icon} size={22} color={Colors.light.tint} />
                  <Text style={styles.typeLabel}>{st.label}</Text>
                  <Ionicons name="add-circle-outline" size={16} color={Colors.light.tabIconDefault} style={{ marginTop: 2 }} />
                </Pressable>
              ))}
            </View>

            {addingType === "other" ? (
              <View style={styles.customInputRow}>
                <TextInput
                  style={styles.customInput}
                  value={customName}
                  onChangeText={setCustomName}
                  placeholder="Enter custom location name"
                  placeholderTextColor={Colors.light.tabIconDefault}
                  autoFocus
                  onSubmitEditing={addCustomLocation}
                  returnKeyType="done"
                />
                <Pressable onPress={addCustomLocation} style={styles.addCustomBtn}>
                  <Text style={styles.addCustomBtnText}>Add</Text>
                </Pressable>
                <Pressable onPress={() => setAddingType(null)} hitSlop={8}>
                  <Ionicons name="close" size={20} color={Colors.light.tabIconDefault} />
                </Pressable>
              </View>
            ) : null}

            <Text style={styles.hint}>
              Tap a type to add it. If you add more than one of the same type, they'll be numbered automatically. Use "Other" for custom names.
            </Text>
          </>
        )}
      </ScrollView>
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
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    width: 60,
  },
  title: {
    fontSize: 18,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
    textAlign: "center",
    flex: 1,
  },
  saveBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.white,
  },
  content: {
    padding: 16,
  },
  loadingContainer: {
    paddingTop: 60,
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.textSecondary,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  emptyCard: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: theme.radius.xl,
    ...theme.shadows.card,
    padding: 24,
    alignItems: "center",
    gap: 6,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
    marginTop: 4,
  },
  emptySubtext: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  locationsList: {
    backgroundColor: Colors.light.white,
    borderRadius: theme.radius.xl,
    ...theme.shadows.card,
    overflow: "hidden",
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.divider,
  },
  locationIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.light.cardBackground,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  locationName: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  locationNameInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
    paddingVertical: 0,
  },
  removeBtn: {
    padding: 4,
  },
  typesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeCard: {
    width: "31%",
    backgroundColor: Colors.light.white,
    borderRadius: theme.radius.xl,
    ...theme.shadows.card,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  typeCardPressed: {
    backgroundColor: Colors.light.cardBackground,
  },
  typeLabel: {
    fontSize: 12,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  customInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  customInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
  },
  addCustomBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  addCustomBtnText: {
    fontSize: 14,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.white,
  },
  hint: {
    fontSize: 12,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 16,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
