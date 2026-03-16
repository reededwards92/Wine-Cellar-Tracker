import React, { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

interface BlobConfig {
  id: string;
  color: string;
  opacity: number;
  /** blob center as fraction of screen width/height */
  fx: number;
  fy: number;
  /** blob radius as fraction of screen width (used for both axes) */
  r: number;
  /** drift range in pixels */
  dx: number;
  dy: number;
  /** animation duration ms */
  duration: number;
  /** 0–1 starting offset so blobs don't all move in sync */
  phase: number;
}

const BLOBS: BlobConfig[] = [
  // Large cream bloom — main light source, center stage
  { id: "cream",  color: "#FDF0E8", opacity: 0.90, fx: 0.42, fy: 0.58, r: 0.72, dx:  44, dy:  28, duration: 6400, phase: 0.00 },
  // Rose — upper-right of lower section
  { id: "rose1",  color: "#C4787F", opacity: 0.62, fx: 0.84, fy: 0.50, r: 0.50, dx: -52, dy:  34, duration: 5200, phase: 0.30 },
  // Amber — left side
  { id: "amber",  color: "#D4A574", opacity: 0.58, fx: 0.10, fy: 0.72, r: 0.48, dx:  46, dy: -38, duration: 6000, phase: 0.60 },
  // Soft blush — lower right
  { id: "blush",  color: "#EBC4C8", opacity: 0.72, fx: 0.68, fy: 0.82, r: 0.56, dx: -34, dy:  44, duration: 7200, phase: 0.15 },
  // Deep rose — bottom left
  { id: "rose2",  color: "#B86068", opacity: 0.50, fx: 0.26, fy: 0.91, r: 0.44, dx:  38, dy: -24, duration: 5600, phase: 0.75 },
];

interface BlobProps {
  cfg: BlobConfig;
  screenW: number;
  screenH: number;
}

function AnimatedBlob({ cfg, screenW, screenH }: BlobProps) {
  const diameter = cfg.r * screenW * 2;
  const baseLeft = cfg.fx * screenW - diameter / 2;
  const baseTop  = cfg.fy * screenH - diameter / 2;

  const tx = useSharedValue(cfg.phase * cfg.dx);
  const ty = useSharedValue(cfg.phase * cfg.dy);

  useEffect(() => {
    tx.value = withRepeat(
      withTiming(cfg.dx, { duration: cfg.duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    ty.value = withRepeat(
      withTiming(cfg.dy, { duration: Math.round(cfg.duration * 1.33), easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <Animated.View
      style={[{ position: "absolute", left: baseLeft, top: baseTop, width: diameter, height: diameter }, animStyle]}
      pointerEvents="none"
    >
      <Svg width={diameter} height={diameter}>
        <Defs>
          <RadialGradient id={`rg_${cfg.id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={cfg.color} stopOpacity={cfg.opacity} />
            <Stop offset="55%"  stopColor={cfg.color} stopOpacity={cfg.opacity * 0.35} />
            <Stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={diameter / 2}
          cy={diameter / 2}
          rx={diameter / 2}
          ry={diameter / 2}
          fill={`url(#rg_${cfg.id})`}
        />
      </Svg>
    </Animated.View>
  );
}

export default function CruMeshBackground() {
  const { width, height } = useWindowDimensions();

  return (
    <>
      {/* Dark burgundy base */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#1A0608" }]} pointerEvents="none" />

      {/* Animated color blobs — only breathe in the lower ~2/3 */}
      {BLOBS.map((cfg) => (
        <AnimatedBlob key={cfg.id} cfg={cfg} screenW={width} screenH={height} />
      ))}

      {/* Top overlay — locks the header area to deep burgundy regardless of blob motion */}
      <LinearGradient
        colors={["#3D0F17", "#5A1A24", "rgba(45,8,15,0.75)", "transparent"]}
        locations={[0, 0.20, 0.34, 0.50]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </>
  );
}
