import React from "react";
import { View, StyleSheet } from "react-native";

export default function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            { flex: 1 },
            i < current ? styles.filled : styles.empty,
            i < total - 1 ? { marginRight: 4 } : null,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    height: 3,
    borderRadius: 2,
  },
  segment: {
    height: 3,
    borderRadius: 2,
  },
  filled: {
    backgroundColor: "#722F37",
  },
  empty: {
    backgroundColor: "rgba(114,47,55,0.18)",
  },
});
