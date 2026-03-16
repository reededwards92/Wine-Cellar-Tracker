import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";

interface Props {
  label: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}

export default function SelectionCard({ label, subtitle, selected, onPress }: Props) {
  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, selected && styles.subtitleSelected]}>{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.85)",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(114,47,55,0.12)",
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    shadowColor: "#2D1215",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardSelected: {
    borderColor: "#722F37",
    backgroundColor: "rgba(114,47,55,0.06)",
  },
  label: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: "#1A0A0C",
  },
  labelSelected: {
    color: "#722F37",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: "rgba(45,18,21,0.55)",
    marginTop: 3,
  },
  subtitleSelected: {
    color: "rgba(114,47,55,0.65)",
  },
});
