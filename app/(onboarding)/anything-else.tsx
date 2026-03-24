import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import CruMeshBackground from "@/components/CruMeshBackground";
import ProgressBar from "@/components/onboarding/ProgressBar";
import { useOnboarding } from "@/contexts/OnboardingContext";

const TINT = "#5E2626";
const TEXT_PRIMARY = "#1A0A0C";
const TEXT_SECONDARY = "rgba(45,18,21,0.55)";

const isWeb = Platform.OS === "web";

export default function AnythingElse() {
  const insets = useSafeAreaInsets();
  const { answers, setAdditionalNotes } = useOnboarding();

  const skip = () => router.replace("/(onboarding)/complete");
  const handleFinish = () => router.replace("/(onboarding)/complete");

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
          <ProgressBar current={5} total={5} />
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
          Anything else I should know?
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: TEXT_SECONDARY,
            marginBottom: 20,
          }}
        >
          Strong dislikes, a favorite bottle, allergies — whatever helps me be a better sommelier for you.
        </Text>

        <TextInput
          style={styles.textInput}
          multiline
          placeholder="I can't stand oaky Chardonnay..."
          placeholderTextColor="rgba(45,18,21,0.35)"
          value={answers.additionalNotes}
          onChangeText={setAdditionalNotes}
          textAlignVertical="top"
          returnKeyType="default"
        />
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
          style={{
            height: 52,
            backgroundColor: TINT,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
          }}
          onPress={handleFinish}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: "#FFFFFF" }}>
            Finish
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  textInput: {
    minHeight: 120,
    maxHeight: 200,
    backgroundColor: "rgba(255,255,255,0.80)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(94,38,38,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#1A0A0C",
  },
});
