import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import CruMeshBackground from "@/components/CruMeshBackground";
import ProgressBar from "@/components/onboarding/ProgressBar";
import { useOnboarding } from "@/contexts/OnboardingContext";

const TINT = "#5E2626";
const TEXT_PRIMARY = "#1A0A0C";
const TEXT_SECONDARY = "rgba(45,18,21,0.55)";

const OPTIONS = [
  { emoji: "🍽️", label: "Weeknight dinners", value: "weeknight" },
  { emoji: "🎉", label: "Dinner parties & entertaining", value: "entertaining" },
  { emoji: "✨", label: "Special occasions & anniversaries", value: "special_occasions" },
  { emoji: "🔍", label: "Tasting & exploring", value: "tasting" },
  { emoji: "📈", label: "Investing & collecting", value: "investing" },
];

const isWeb = Platform.OS === "web";

function OccasionCard({
  emoji,
  label,
  selected,
  onPress,
}: {
  emoji: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

export default function Occasions() {
  const insets = useSafeAreaInsets();
  const { answers, toggleOccasion } = useOnboarding();

  const canProceed = answers.occasions.length > 0;

  const skip = () => router.replace("/(onboarding)/complete");
  const handleNext = () => router.push("/(onboarding)/anything-else");

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
          <ProgressBar current={4} total={5} />
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
          When do you usually reach for a bottle?
        </Text>

        <View style={{ marginTop: 16 }}>
          {OPTIONS.map((opt) => (
            <OccasionCard
              key={opt.value}
              emoji={opt.emoji}
              label={opt.label}
              selected={answers.occasions.includes(opt.value)}
              onPress={() => toggleOccasion(opt.value)}
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

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(94,38,38,0.12)",
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#1C1B1A",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardSelected: {
    borderColor: "#5E2626",
    backgroundColor: "rgba(94,38,38,0.06)",
  },
  emoji: {
    fontSize: 22,
    marginRight: 14,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1A0A0C",
    flex: 1,
  },
  labelSelected: {
    color: "#5E2626",
  },
});
