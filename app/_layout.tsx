import { Stack, useSegments, useRouter, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Colors from "@/constants/colors";
import { QueryPersistProvider } from "@/components/QueryPersistProvider";

SplashScreen.preventAutoHideAsync();

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
    SplashScreen.hideAsync();
  }, []);

  return (
    <ErrorBoundary>
      <QueryPersistProvider>
        <AuthProvider>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthGate />
            </KeyboardProvider>
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
