import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { apiRequest } from "@/lib/query-client";

// Web uses the Web Push API via the service worker, not expo-notifications.
// Skip the handler setup on web to avoid spurious warnings.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () =>
      ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }) as any,
  });
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Send token to server
    await apiRequest("POST", "/api/auth/push-token", { token });

    return token;
  } catch {
    return null;
  }
}
