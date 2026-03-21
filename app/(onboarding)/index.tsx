import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import CruMeshBackground from "@/components/CruMeshBackground";

const TINT = "#5E2626";
const TEXT_PRIMARY = "#1A0A0C";
const TEXT_SECONDARY = "rgba(45,18,21,0.55)";

export default function OnboardingWelcome() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: "#FDF8F5" }]}>
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
          <Text style={styles.heading}>Meet Cru</Text>
          <Text style={styles.body}>
            Your personal sommelier. A few quick questions and I'll know your cellar — and your taste — like the back of my hand.
          </Text>
        </View>

        <View style={styles.buttonsArea}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.push("/(onboarding)/collector-type")}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
          </Pressable>
          <Pressable
            style={styles.skipLink}
            onPress={() => router.replace("/(onboarding)/complete")}
          >
            <Text style={styles.skipLinkText}>Skip for now — I'll learn as we go</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  heading: {
    fontSize: 42,
    fontFamily: "New York", fontWeight: "700",
    color: TEXT_PRIMARY,
    textAlign: "center",
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    textAlign: "center",
    paddingHorizontal: 8,
    lineHeight: 24,
  },
  buttonsArea: {
    gap: 12,
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
    fontWeight: "600",
    color: "#FFFFFF",
  },
  skipLink: {
    alignItems: "center",
    paddingVertical: 8,
  },
  skipLinkText: {
    fontSize: 14,
    color: "rgba(107,74,79,0.7)",
  },
});
