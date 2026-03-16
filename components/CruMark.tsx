import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";

export type CruMarkState = "idle" | "thinking" | "speaking" | "celebrating";

interface Props {
  size: "sm" | "md" | "lg";
  state?: CruMarkState;
  style?: any;
}

const SIZE_MAP = { sm: 32, md: 64, lg: 200 };
const SPARKLE_SIZE = { sm: 16, md: 28, lg: 64 };

const GRADIENT_COLORS: Record<CruMarkState, [string, string, string, string]> = {
  idle: ["#6B2A32", "#C4787F", "#FDF6F0", "#D4A574"],
  thinking: ["#4A1520", "#8B3540", "#C4787F", "#FDF6F0"],
  speaking: ["#722F37", "#C4787F", "#FDF6F0", "#D4A574"],
  celebrating: ["#D4A574", "#E8C49A", "#722F37", "#FDF6F0"],
};

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function CruMark({ size, state = "idle", style }: Props) {
  const dim = SIZE_MAP[size];
  const sparkleSize = SPARKLE_SIZE[size];
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const rotation = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(opacity);
    cancelAnimation(rotation);

    if (size === "sm") {
      // No animation for small size
      scale.value = 1;
      opacity.value = 1;
      return;
    }

    switch (state) {
      case "idle":
        scale.value = withRepeat(
          withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        opacity.value = 1;
        rotation.value = size === "lg"
          ? withRepeat(withTiming(360, { duration: 8000, easing: Easing.linear }), -1, false)
          : 0;
        break;

      case "thinking":
        scale.value = withRepeat(
          withTiming(1.08, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        opacity.value = 1;
        rotation.value = size === "lg"
          ? withRepeat(withTiming(360, { duration: 2000, easing: Easing.linear }), -1, false)
          : 0;
        break;

      case "speaking":
        scale.value = 1;
        opacity.value = withRepeat(
          withTiming(0.8, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
        rotation.value = size === "lg"
          ? withRepeat(withTiming(360, { duration: 6000, easing: Easing.linear }), -1, false)
          : 0;
        break;

      case "celebrating":
        scale.value = withSequence(
          withTiming(1.2, { duration: 250, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 250, easing: Easing.in(Easing.ease) })
        );
        opacity.value = 1;
        rotation.value = 0;
        break;
    }
  }, [state, size]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  if (size === "sm") {
    return (
      <View style={[styles.smCircle, { width: dim, height: dim, borderRadius: dim / 2 }, style]}>
        <Text style={[styles.sparkle, { fontSize: sparkleSize }]}>{"\u2726"}</Text>
      </View>
    );
  }

  const colors = GRADIENT_COLORS[state];

  return (
    <Animated.View style={[{ width: dim, height: dim }, animatedStyle, style]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { width: dim, height: dim, borderRadius: dim / 2 }]}
      >
        <Text style={[styles.sparkle, { fontSize: sparkleSize, color: "#fff" }]}>{"\u2726"}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  smCircle: {
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.card,
  },
  gradient: {
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadows.elevated,
  },
  sparkle: {
    color: "#fff",
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});
