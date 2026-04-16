import { Stack, useSegments, useRouter, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef, type PropsWithChildren } from "react";
import { Platform, View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { QueryPersistProvider } from "@/components/QueryPersistProvider";

// SplashScreen is a no-op on web — guard to avoid potential crashes.
if (Platform.OS !== "web") {
  SplashScreen.preventAutoHideAsync();
}

/**
 * react-native-keyboard-controller is native-only. On web the standard
 * browser keyboard behaviour is fine so we just render children directly.
 */
let KeyboardWrapper: React.ComponentType<PropsWithChildren>;
if (Platform.OS === "web") {
  KeyboardWrapper = ({ children }: PropsWithChildren) => <>{children}</>;
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { KeyboardProvider } = require("react-native-keyboard-controller");
  KeyboardWrapper = KeyboardProvider;
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!navigationState?.key) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";
    const inTabsGroup = segments[0] === "(tabs)";

    if (!user && !inAuthGroup) {
      hasNavigated.current = false;
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup && !hasNavigated.current) {
      hasNavigated.current = true;
      if (!user.has_completed_onboarding) {
        router.replace("/(onboarding)");
      } else {
        router.replace("/(tabs)");
      }
    } else if (user && inTabsGroup && !user.has_completed_onboarding) {
      router.replace("/(onboarding)");
    } else if (user && inOnboardingGroup && user.has_completed_onboarding) {
      router.replace("/(tabs)");
    }

    // Register for push notifications after auth (fire-and-forget)
    if (user) {
      import("@/lib/notifications").then((m) => m.registerForPushNotifications()).catch(() => {});
    }
  }, [user, isLoading, segments, navigationState?.key]);

  if (isLoading || !navigationState?.key) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: "Back" }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="wine/[id]" />
      <Stack.Screen name="account" />
      <Stack.Screen name="import-guide" />
      <Stack.Screen name="storage-locations" />
      <Stack.Screen name="cru-profile" />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS !== "web") {
      SplashScreen.hideAsync();
    }
  }, []);

  return (
    <ErrorBoundary>
      <QueryPersistProvider>
        <AuthProvider>
          <GestureHandlerRootView>
            <KeyboardWrapper>
              <AuthGate />
            </KeyboardWrapper>
          </GestureHandlerRootView>
        </AuthProvider>
      </QueryPersistProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.light.background,
  },
});
