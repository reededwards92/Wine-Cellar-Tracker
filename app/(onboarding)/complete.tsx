import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import CruMeshBackground from "@/components/CruMeshBackground";
import { useOnboarding } from "@/contexts/OnboardingContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/query-client";

const TINT = "#722F37";
const TEXT_PRIMARY = "#1A0A0C";
const TEXT_SECONDARY = "rgba(45,18,21,0.55)";

interface OnboardingAnswers {
  collectorLevel: string | null;
  wineStyles: string[];
  regions: string[];
  occasions: string[];
  additionalNotes: string;
}

function buildSummary(answers: OnboardingAnswers): string {
  const { collectorLevel, wineStyles, regions, occasions, additionalNotes } = answers;

  const hasAny =
    collectorLevel ||
    wineStyles.length > 0 ||
    regions.length > 0 ||
    occasions.length > 0 ||
    additionalNotes;

  if (!hasAny) {
    return "No problem — I'll learn your preferences as you build your cellar. I'm a quick study.";
  }

  const parts: string[] = [];

  if (collectorLevel) {
    const levelMap: Record<string, string> = {
      beginner: "just getting started",
      intermediate: "building a growing collection",
      advanced: "a serious collector with strong preferences",
      expert: "a seasoned collector",
    };
    parts.push(`you're ${levelMap[collectorLevel] || collectorLevel}`);
  }

  if (wineStyles.length > 0 && !wineStyles.includes("everything")) {
    const styleMap: Record<string, string> = {
      bold_red: "bold structured reds",
      elegant_red: "elegant earthy reds",
      crisp_white: "crisp mineral whites",
      rich_white: "rich textured whites",
      sparkling: "sparkling wines",
      rose: "rosé",
      dessert_fortified: "dessert and fortified wines",
    };
    const styleLabels = wineStyles.map((s) => styleMap[s] || s);
    parts.push(`you love ${styleLabels.join(" and ")}`);
  } else if (wineStyles.includes("everything")) {
    parts.push("you drink everything");
  }

  if (regions.length > 0 && !regions.includes("anything")) {
    parts.push(`with a soft spot for ${regions.slice(0, 3).join(", ")}`);
  }

  if (occasions.length > 0) {
    const occasionMap: Record<string, string> = {
      weeknight: "weeknight dinners",
      entertaining: "dinner parties",
      special_occasions: "special occasions",
      tasting: "tasting and exploring",
      investing: "investing and collecting",
    };
    const occLabels = occasions.map((o) => occasionMap[o] || o);
    parts.push(`mostly for ${occLabels.join(" and ")}`);
  }

  if (parts.length === 0) {
    return "Got it — I'll learn the rest as we go and personalize your recommendations from day one.";
  }

  const sentence = parts.join(", ");
  return `Got it — ${sentence}. I'll keep that in mind as I get to know your cellar.`;
}

function buildMemoryString(answers: OnboardingAnswers): string {
  const lines: string[] = ["Taste profile from onboarding:"];
  if (answers.collectorLevel) lines.push(`- Collector level: ${answers.collectorLevel}`);
  if (answers.wineStyles.length > 0) lines.push(`- Wine styles: ${answers.wineStyles.join(", ")}`);
  if (answers.regions.length > 0) lines.push(`- Preferred regions: ${answers.regions.join(", ")}`);
  if (answers.occasions.length > 0) lines.push(`- Occasions: ${answers.occasions.join(", ")}`);
  if (answers.additionalNotes) lines.push(`- Additional notes: ${answers.additionalNotes}`);
  return lines.join("\n");
}

export default function OnboardingComplete() {
  const insets = useSafeAreaInsets();
  const { answers } = useOnboarding();
  const { markOnboardingComplete } = useAuth();
  const [saving, setSaving] = useState(false);

  const summary = buildSummary(answers);

  const handleExplore = async () => {
    setSaving(true);
    const { collectorLevel, wineStyles, regions, occasions, additionalNotes } = answers;
    const hasAny = collectorLevel || wineStyles.length > 0 || regions.length > 0 || occasions.length > 0 || additionalNotes;

    if (hasAny) {
      try {
        await apiRequest("POST", "/api/memories", {
          content: buildMemoryString(answers),
          category: "preference",
        });
      } catch (err) {
        console.warn("[OnboardingComplete] Could not save taste memory:", err);
      }
    }

    try {
      await apiRequest("POST", "/api/onboarding/complete", {});
    } catch (err) {
      console.warn("[OnboardingComplete] Could not mark onboarding complete on server:", err);
    }

    markOnboardingComplete();
    router.replace("/(tabs)");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#FDF6F0" }}>
      <CruMeshBackground />
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: Math.max(insets.bottom, 20) + 16,
          },
        ]}
      >
        <View style={styles.centerArea}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>🍷</Text>
          </View>
          <Text style={styles.heading}>You're all set</Text>
          <Text style={styles.summary}>{summary}</Text>
        </View>

        <Pressable style={[styles.primaryButton, saving && { opacity: 0.7 }]} onPress={saving ? undefined : handleExplore} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>Explore My Cellar</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  centerArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2D1215",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  iconEmoji: {
    fontSize: 38,
  },
  heading: {
    fontSize: 32,
    fontFamily: "LibreBaskerville_700Bold",
    color: TEXT_PRIMARY,
    marginTop: 24,
    textAlign: "center",
  },
  summary: {
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: TEXT_SECONDARY,
    textAlign: "center",
    paddingHorizontal: 4,
    marginTop: 16,
    lineHeight: 22,
  },
  primaryButton: {
    height: 52,
    backgroundColor: TINT,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: "#FFFFFF",
  },
});
