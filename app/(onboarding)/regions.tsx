import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import CruMeshBackground from "@/components/CruMeshBackground";
import ProgressBar from "@/components/onboarding/ProgressBar";
import SelectionChip from "@/components/onboarding/SelectionChip";
import { useOnboarding } from "@/contexts/OnboardingContext";

const TINT = "#5E2626";
const TEXT_PRIMARY = "#1A0A0C";
const TEXT_SECONDARY = "rgba(45,18,21,0.55)";

const NAMED_REGIONS = [
  "Bordeaux",
  "Burgundy",
  "Champagne",
  "Rhône Valley",
  "Loire Valley",
  "Alsace",
  "Napa Valley",
  "Sonoma",
  "Oregon",
  "Piedmont",
  "Tuscany",
  "Rioja",
  "Ribera del Duero",
  "Mosel",
  "Barossa Valley",
  "Mendoza",
  "South Africa",
  "New Zealand",
];

const isWeb = Platform.OS === "web";

export default function Regions() {
  const insets = useSafeAreaInsets();
  const { answers, toggleRegion } = useOnboarding();

  const canProceed = answers.regions.length > 0;

  const skip = () => router.replace("/(onboarding)/complete");
  const handleNext = () => router.push("/(onboarding)/occasions");

  return (
    <View style={{ flex: 1, backgroundColor: "#FDF8F5" }}>
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
          <ProgressBar current={3} total={5} />
        </View>
        <Pressable onPress={skip} style={{ paddingLeft: 16 }}>
          <Text style={{ fontSize: 14, color: "rgba(107,74,79,0.7)" }}>
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
            fontFamily: "New York", fontWeight: "700",
            color: TEXT_PRIMARY,
            marginBottom: 6,
          }}
        >
          Any regions close to your heart?
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: TEXT_SECONDARY,
            marginBottom: 20,
          }}
        >
          Pick your favorites — or skip if you're still exploring
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {NAMED_REGIONS.map((region) => (
            <SelectionChip
              key={region}
              label={region}
              selected={answers.regions.includes(region)}
              onPress={() => toggleRegion(region)}
            />
          ))}
          <SelectionChip
            label="I'm open to anything"
            selected={answers.regions.includes("anything")}
            onPress={() => toggleRegion("anything")}
          />
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
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
            Next →
          </Text>
        </Pressable>
        <Pressable onPress={skip} style={{ alignItems: "center", paddingVertical: 6 }}>
          <Text style={{ fontSize: 14, color: "rgba(107,74,79,0.7)" }}>
            Skip
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
