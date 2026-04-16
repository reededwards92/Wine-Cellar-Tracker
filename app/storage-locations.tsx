import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// react-native-draggable-flatlist is native-only. On web, fall back to a
// plain FlatList (no drag reorder — acceptable for the PWA).
let DraggableFlatList: any;
let ScaleDecorator: any;
type RenderItemParams<T> = any;

if (Platform.OS !== "web") {
  const draggable = require("react-native-draggable-flatlist");
  DraggableFlatList = draggable.default;
  ScaleDecorator = draggable.ScaleDecorator;
} else {
  ScaleDecorator = ({ children }: any) => children;
}
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

function LocationList({
  isWeb,
  locations,
  setLocations,
  setHasChanges,
  renderLocationItem,
  insets,
  listFooter,
}: any) {
  const sharedProps = {
    data: locations,
    keyExtractor: (item: StorageLocation, idx: number) => `${item.type}-${idx}`,
    contentContainerStyle: [
      styles.content,
      { paddingBottom: isWeb ? 54 : insets.bottom + 20 },
    ],
    keyboardShouldPersistTaps: "handled" as const,
    ListHeaderComponent: <Text style={styles.sectionTitle}>YOUR LOCATIONS</Text>,
    ListEmptyComponent: (
      <View style={styles.emptyCard}>
        <Ionicons name="location-outline" size={32} color={Colors.light.tabIconDefault} />
        <Text style={styles.emptyText}>No storage locations set up yet</Text>
        <Text style={styles.emptySubtext}>Add locations below to organize your cellar</Text>
      </View>
    ),
    ListFooterComponent: listFooter,
  };

  if (Platform.OS === "web" || !DraggableFlatList) {
    return (
      <FlatList
        {...sharedProps}
        renderItem={({ item, index }: any) =>
          renderLocationItem({ item, drag: () => {}, isActive: false, getIndex: () => index })
        }
      />
    );
  }

  return (
    <DraggableFlatList
      {...sharedProps}
      renderItem={renderLocationItem}
      onDragEnd={({ data }: any) => {
        setLocations(data);
        setHasChanges(true);
      }}
    />
  );
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

  const hasDuplicateName = (name: string) =>
    locations.some((l) => l.name.toLowerCase() === name.toLowerCase());

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

    if (hasDuplicateName(name)) {
      Alert.alert("Duplicate Name", `A location named "${name}" already exists.`);
      return;
    }

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
    const name = customName.trim();
    if (hasDuplicateName(name)) {
      Alert.alert("Duplicate Name", `A location named "${name}" already exists.`);
      return;
    }
    setLocations([...locations, { name, type: "other" }]);
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
    // Check for case-insensitive duplicate names before saving
    const seen = new Set<string>();
    for (const loc of locations) {
      const key = loc.name.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) {
        Alert.alert("Duplicate Name", `"${loc.name.trim()}" appears more than once. Please rename or remove the duplicate.`);
        return;
      }
      seen.add(key);
    }
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

  const renderLocationItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<StorageLocation>) => {
    const idx = getIndex() ?? 0;
    return (
      <ScaleDecorator>
        <View style={[styles.locationRow, isActive && styles.locationRowDragging]}>
          <Pressable onLongPress={drag} delayLongPress={150} style={styles.dragHandle}>
            <Ionicons name="reorder-three" size={20} color={Colors.light.tabIconDefault} />
          </Pressable>
          <View style={styles.locationIcon}>
            <Ionicons name={getIconForType(item.type)} size={18} color={Colors.light.tint} />
          </View>
          <TextInput
            style={styles.locationNameInput}
            value={item.name}
            onChangeText={(val) => renameLocation(idx, val)}
            placeholder="Location name"
            placeholderTextColor="rgba(94, 38, 38, 0.38)"
          />
          <Pressable onPress={() => removeLocation(idx)} hitSlop={8} style={styles.removeBtn}>
            <Ionicons name="close-circle" size={20} color={Colors.light.danger} />
          </Pressable>
        </View>
      </ScaleDecorator>
    );
  }, [locations, renameLocation, removeLocation]);

  const listFooter = (
    <>
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
            placeholderTextColor="rgba(94, 38, 38, 0.38)"
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
        Tap a type to add it. If you add more than one of the same type, they'll be numbered automatically. Use "Other" for custom names. Long-press the drag handle to reorder.
      </Text>
    </>
  );

  return (
    <GestureHandlerRootView style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.light.tint} />
          </Pressable>
          <Text style={styles.title}>Storage Locations</Text>
          <View style={{ width: 72 }}>
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

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      ) : (
        <LocationList
          isWeb={isWeb}
          locations={locations}
          setLocations={setLocations}
          setHasChanges={setHasChanges}
          renderLocationItem={renderLocationItem}
          insets={insets}
          listFooter={listFooter}
        />
      )}
    </GestureHandlerRootView>
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
    fontFamily: "New York", fontWeight: "700",
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
    fontWeight: "600",
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
    fontWeight: "600",
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
    fontWeight: "500",
    color: Colors.light.text,
    marginTop: 4,
  },
  emptySubtext: {
    fontSize: 13,
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
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.divider,
  },
  locationRowDragging: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: theme.radius.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  dragHandle: {
    paddingRight: 8,
    paddingVertical: 4,
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
    fontWeight: "500",
    color: Colors.light.text,
  },
  locationNameInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
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
    fontWeight: "500",
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
    fontWeight: "600",
    color: Colors.light.white,
  },
  hint: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 16,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
});
