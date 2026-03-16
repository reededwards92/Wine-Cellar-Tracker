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
    borderColor: "rgba(114,47,55,0.22)",
    backgroundColor: "rgba(255,255,255,0.80)",
  },
  chipSelected: {
    backgroundColor: "#722F37",
    borderColor: "#722F37",
  },
  label: {
    fontSize: 14,
    fontFamily: "Outfit_500Medium",
    color: "rgba(45,18,21,0.75)",
  },
  labelSelected: {
    color: "#FFFFFF",
  },
});
