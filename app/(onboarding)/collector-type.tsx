import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import CruMeshBackground from "@/components/CruMeshBackground";
import ProgressBar from "@/components/onboarding/ProgressBar";
import SelectionCard from "@/components/onboarding/SelectionCard";
import { useOnboarding } from "@/contexts/OnboardingContext";

const TINT = "#722F37";
const TEXT_PRIMARY = "#1A0A0C";
const TEXT_SECONDARY = "rgba(45,18,21,0.55)";

const OPTIONS = [
  { label: "Just getting started", subtitle: "Building my first collection", value: "beginner" },
  { label: "Growing", subtitle: "50–200 bottles, exploring widely", value: "intermediate" },
  { label: "Serious cellar", subtitle: "200+ bottles, strong preferences", value: "advanced" },
  { label: "I've lost count", subtitle: "Let's just say the cellar is full", value: "expert" },
];

const isWeb = Platform.OS === "web";

export default function CollectorType() {
  const insets = useSafeAreaInsets();
  const { answers, setCollectorLevel } = useOnboarding();

  const canProceed = !!answers.collectorLevel;

  const skip = () => router.replace("/(onboarding)/complete");
  const handleNext = () => router.push("/(onboarding)/wine-styles");

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
          <ProgressBar current={1} total={5} />
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
          How would you describe your collection?
        </Text>

        <View style={{ marginTop: 16 }}>
          {OPTIONS.map((opt) => (
            <SelectionCard
              key={opt.value}
              label={opt.label}
              subtitle={opt.subtitle}
              selected={answers.collectorLevel === opt.value}
              onPress={() => setCollectorLevel(opt.value)}
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
      </View>
    </View>
  );
}
