import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import CruMeshBackground from "@/components/CruMeshBackground";
import ProgressBar from "@/components/onboarding/ProgressBar";
import SelectionChip from "@/components/onboarding/SelectionChip";
import { useOnboarding } from "@/contexts/OnboardingContext";

const TINT = "#722F37";
const TEXT_PRIMARY = "#1A0A0C";
const TEXT_SECONDARY = "rgba(45,18,21,0.55)";

const CHIPS = [
  { label: "Bold & structured reds", value: "bold_red" },
  { label: "Elegant & earthy reds", value: "elegant_red" },
  { label: "Crisp & mineral whites", value: "crisp_white" },
  { label: "Rich & textured whites", value: "rich_white" },
  { label: "Sparkling", value: "sparkling" },
  { label: "Rosé", value: "rose" },
  { label: "Dessert & fortified", value: "dessert_fortified" },
  { label: "I drink everything", value: "everything" },
];

const isWeb = Platform.OS === "web";

export default function WineStyles() {
  const insets = useSafeAreaInsets();
  const { answers, toggleWineStyle } = useOnboarding();

  const canProceed = answers.wineStyles.length > 0;

  const skip = () => router.replace("/(onboarding)/complete");
  const handleNext = () => router.push("/(onboarding)/regions");

  return (
    <View style={{ flex: 1, backgroundColor: "#FDF6F0" }}>
      <CruMeshBackground />

      <View
        style={{
          paddingTop: isWeb ? 67 : insets.top + 12,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <ProgressBar current={2} total={5} />
        </View>
        <Pressable onPress={skip} style={{ paddingLeft: 16 }}>
          <Text style={{ fontSize: 14, fontFamily: "Outfit_400Regular", color: "rgba(107,74,79,0.7)" }}>
            Skip
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={{
            fontSize: 22,
            fontFamily: "LibreBaskerville_700Bold",
            color: TEXT_PRIMARY,
            marginBottom: 6,
          }}
        >
          What do you reach for most?
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Outfit_400Regular",
            color: TEXT_SECONDARY,
            marginBottom: 20,
          }}
        >
          Pick as many as you like
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {CHIPS.map((chip) => (
            <SelectionChip
              key={chip.value}
              label={chip.label}
              selected={answers.wineStyles.includes(chip.value)}
              onPress={() => toggleWineStyle(chip.value)}
            />
          ))}
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 20) + 4,
          paddingTop: 12,
          backgroundColor: "transparent",
          gap: 10,
        }}
      >
        <Pressable
          style={[
            {
              height: 52,
              backgroundColor: TINT,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
            },
            !canProceed && { opacity: 0.45 },
          ]}
          onPress={canProceed ? handleNext : undefined}
          disabled={!canProceed}
        >
          <Text style={{ fontSize: 16, fontFamily: "Outfit_600SemiBold", color: "#FFFFFF" }}>
            Next →
          </Text>
        </Pressable>
        <Pressable onPress={skip} style={{ alignItems: "center", paddingVertical: 6 }}>
          <Text style={{ fontSize: 14, fontFamily: "Outfit_400Regular", color: "rgba(107,74,79,0.7)" }}>
            Skip
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
