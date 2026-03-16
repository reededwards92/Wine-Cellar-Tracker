import { Tabs } from "expo-router";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import Colors from "@/constants/colors";
import { CruInsightsProvider } from "@/contexts/CruInsightsContext";

function ScanTabButton({ onPress, accessibilityState }: any) {
  const focused = accessibilityState?.selected;
  return (
    <Pressable onPress={onPress} style={styles.scanButtonWrapper}>
      <View style={[styles.scanButton, focused && styles.scanButtonFocused]}>
        <Ionicons name="camera" size={26} color="#fff" />
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";

  return (
    <CruInsightsProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#722F37",
          tabBarInactiveTintColor: "rgba(45, 18, 21, 0.38)",
          tabBarStyle: {
            position: "absolute",
            backgroundColor: "transparent",
            borderTopWidth: 0.5,
            borderTopColor: "rgba(114, 47, 55, 0.10)",
            elevation: 0,
            height: Platform.OS === "web" ? 84 : 68,
          },
          tabBarBackground: () =>
            isIOS ? (
              <BlurView intensity={55} tint="light" style={StyleSheet.absoluteFill} />
            ) : (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.light.bgGradientEnd }]} />
            ),
          tabBarLabelStyle: {
            fontFamily: "Outfit_500Medium",
            fontSize: 11,
          },
        }}
      >
        <Tabs.Screen
          name="sommelier"
          options={{
            title: "Cru",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "sparkles" : "sparkles-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: "Cellar",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "wine" : "wine-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: "",
            tabBarButton: (props) => <ScanTabButton {...props} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "time" : "time-outline"} size={22} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
            ),
          }}
        />
      </Tabs>
    </CruInsightsProvider>
  );
}

const styles = StyleSheet.create({
  scanButtonWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    top: -13,
  },
  scanButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2D1215",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.50,
    shadowRadius: 14,
    elevation: 12,
  },
  scanButtonFocused: {
    backgroundColor: "#5a1f28",
  },
});
