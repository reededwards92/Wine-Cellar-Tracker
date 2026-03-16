import { Tabs, usePathname } from "expo-router";
import { BlurView } from "expo-blur";
import {
  Platform,
  StyleSheet,
  View,
  Pressable,
  Text,
  Animated,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { CruInsightsProvider } from "@/contexts/CruInsightsContext";

const TABS = [
  { name: "sommelier", label: "Cru", icon: "sparkles" as const, iconFocused: "sparkles" as const },
  { name: "index", label: "Cellar", icon: "wine-outline" as const, iconFocused: "wine" as const },
  { name: "add", label: "", icon: "camera" as const, iconFocused: "camera" as const },
  { name: "history", label: "History", icon: "time-outline" as const, iconFocused: "time" as const },
  { name: "settings", label: "Settings", icon: "settings-outline" as const, iconFocused: "settings" as const },
];

// Map route names to tab indices
const ROUTE_TO_INDEX: Record<string, number> = {
  sommelier: 0,
  index: 1,
  add: 2,
  history: 3,
  settings: 4,
};

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isIOS = Platform.OS === "ios";
  const TAB_COUNT = TABS.length;
  const TAB_WIDTH = width / TAB_COUNT;
  const PILL_WIDTH = TAB_WIDTH - 16;
  const BAR_HEIGHT = 54;

  const pillX = useRef(new Animated.Value(state.index * TAB_WIDTH + 8)).current;

  useEffect(() => {
    Animated.spring(pillX, {
      toValue: state.index * TAB_WIDTH + 8,
      useNativeDriver: true,
      stiffness: 280,
      damping: 28,
      mass: 0.8,
    }).start();
  }, [state.index]);

  const paddingBottom = insets.bottom > 0 ? insets.bottom : 8;
  const totalHeight = BAR_HEIGHT + paddingBottom;

  return (
    <View style={[styles.barOuter, { height: totalHeight }]}>
      {isIOS ? (
        <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.light.bgGradientEnd }]} />
      )}
      <View style={[StyleSheet.absoluteFill, styles.barBorder]} />

      {/* Sliding pill */}
      {state.index !== 2 && (
        <Animated.View
          style={[
            styles.pill,
            { width: PILL_WIDTH, height: BAR_HEIGHT - 10, transform: [{ translateX: pillX }] },
          ]}
        />
      )}

      {/* Tab items */}
      <View style={[styles.tabRow, { height: BAR_HEIGHT }]}>
        {TABS.map((tab, i) => {
          const route = state.routes[i];
          const focused = state.index === i;
          const color = focused ? "#722F37" : "rgba(45, 18, 21, 0.40)";

          if (tab.name === "add") {
            return (
              <Pressable
                key={tab.name}
                onPress={() => navigation.navigate(route.key)}
                style={styles.scanWrapper}
              >
                <View style={[styles.scanButton, focused && styles.scanButtonFocused]}>
                  <Ionicons name="camera" size={26} color="#fff" />
                </View>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={tab.name}
              onPress={() => navigation.navigate(route.key)}
              style={styles.tabItem}
            >
              <Ionicons
                name={focused ? tab.iconFocused : tab.icon}
                size={22}
                color={color}
              />
              <Text style={[styles.label, { color }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Safe area spacer */}
      <View style={{ height: paddingBottom }} />
    </View>
  );
}

export default function TabLayout() {
  return (
    <CruInsightsProvider>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="sommelier" options={{ title: "Cru" }} />
        <Tabs.Screen name="index" options={{ title: "Cellar" }} />
        <Tabs.Screen name="add" options={{ title: "" }} />
        <Tabs.Screen name="history" options={{ title: "History" }} />
        <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      </Tabs>
    </CruInsightsProvider>
  );
}

const styles = StyleSheet.create({
  barOuter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
  barBorder: {
    borderTopWidth: 0.5,
    borderTopColor: "rgba(114, 47, 55, 0.10)",
  },
  pill: {
    position: "absolute",
    top: 5,
    borderRadius: 14,
    backgroundColor: "rgba(114, 47, 55, 0.10)",
    borderWidth: 0.5,
    borderColor: "rgba(114, 47, 55, 0.18)",
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: {
    fontSize: 11,
    fontFamily: "Outfit_500Medium",
  },
  scanWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    top: -14,
  },
  scanButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2D1215",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  scanButtonFocused: {
    backgroundColor: "#5a1f28",
  },
});
