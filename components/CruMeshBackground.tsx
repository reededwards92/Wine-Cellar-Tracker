import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

interface BlobConfig {
  id: string;
  size: number;
  color: string;
  stopOpacity: number;
  position: {
    top?: number;
    left?: number;
    right?: number;
    bottom?: number;
  };
  /** max translation in each direction */
  dx: number;
  dy: number;
  /** full cycle duration ms (X and Y are independent) */
  durationX: number;
  durationY: number;
  /** initial offset to stagger phase at mount */
  initX: number;
  initY: number;
}

const BLOBS: BlobConfig[] = [
  {
    id: "b1",
    size: 340,
    color: "#722F37",
    stopOpacity: 0.20,
    position: { top: -80, left: -80 },
    dx: 40, dy: 30,
    durationX: 18000, durationY: 14000,
    initX: 15, initY: -10,
  },
  {
    id: "b2",
    size: 260,
    color: "#A0404A",
    stopOpacity: 0.18,
    position: { top: 80, right: -50 },
    dx: 30, dy: 45,
    durationX: 22000, durationY: 16000,
    initX: -20, initY: 18,
  },
  {
    id: "b3",
    size: 300,
    color: "#E8C4B0",
    stopOpacity: 0.75,
    position: { top: 180, left: 20 },
    dx: 45, dy: 35,
    durationX: 15000, durationY: 19000,
    initX: 25, initY: -15,
  },
  {
    id: "b4",
    size: 300,
    color: "#722F37",
    stopOpacity: 0.22,
    position: { bottom: -60, right: -60 },
    dx: 35, dy: 40,
    durationX: 24000, durationY: 18000,
    initX: -18, initY: 22,
  },
  {
    id: "b5",
    size: 240,
    color: "#E8C4B0",
    stopOpacity: 0.70,
    position: { bottom: 140, left: -30 },
    dx: 50, dy: 28,
    durationX: 13000, durationY: 21000,
    initX: 30, initY: -8,
  },
  {
    id: "b6",
    size: 220,
    color: "#A0404A",
    stopOpacity: 0.18,
    position: { top: 350, right: 10 },
    dx: 28, dy: 50,
    durationX: 20000, durationY: 12000,
    initX: -12, initY: 35,
  },
];

function makeLoop(value: Animated.Value, max: number, duration: number) {
  const q = Math.round(duration / 4);
  return Animated.loop(
    Animated.sequence([
      Animated.timing(value, { toValue:  max, duration: q,     easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(value, { toValue: -max, duration: q * 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(value, { toValue:    0, duration: q,     easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])
  );
}

function Blob({ cfg }: { cfg: BlobConfig }) {
  const tx = useRef(new Animated.Value(cfg.initX)).current;
  const ty = useRef(new Animated.Value(cfg.initY)).current;

  useEffect(() => {
    const xa = makeLoop(tx, cfg.dx, cfg.durationX);
    const ya = makeLoop(ty, cfg.dy, cfg.durationY);
    xa.start();
    ya.start();
    return () => { xa.stop(); ya.stop(); };
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        cfg.position,
        { transform: [{ translateX: tx }, { translateY: ty }] },
      ]}
    >
      <Svg width={cfg.size} height={cfg.size}>
        <Defs>
          <RadialGradient id={`rg_${cfg.id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0%"   stopColor={cfg.color} stopOpacity={cfg.stopOpacity} />
            <Stop offset="100%" stopColor={cfg.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle
          cx={cfg.size / 2}
          cy={cfg.size / 2}
          r={cfg.size / 2}
          fill={`url(#rg_${cfg.id})`}
        />
      </Svg>
    </Animated.View>
  );
}

export default function CruMeshBackground() {
  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="none">
      {BLOBS.map((cfg) => (
        <Blob key={cfg.id} cfg={cfg} />
      ))}
      {/* Keeps the header area dark enough for white text */}
      <LinearGradient
        colors={["#6B2A32", "#722F37", "rgba(114,47,55,0.0)"]}
        locations={[0, 0.14, 0.38]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: "absolute",
  },
});
