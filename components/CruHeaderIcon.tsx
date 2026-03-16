import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import CruMark from "./CruMark";

interface Props {
  onPress: () => void;
  showBadge?: boolean;
}

export default function CruHeaderIcon({ onPress, showBadge }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <CruMark size="sm" state="idle" />
      {showBadge && <View style={styles.badge} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.danger,
  },
});
