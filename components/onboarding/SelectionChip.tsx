import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";

interface Props {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export default function SelectionChip({ label, selected, onPress }: Props) {
  return (
    <Pressable
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "rgba(94,38,38,0.22)",
    backgroundColor: "rgba(255,255,255,0.80)",
  },
  chipSelected: {
    backgroundColor: "#5E2626",
    borderColor: "#5E2626",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "rgba(45,18,21,0.75)",
  },
  labelSelected: {
    color: "#FFFFFF",
  },
});
