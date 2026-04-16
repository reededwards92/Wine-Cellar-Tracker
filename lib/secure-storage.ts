import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Cross-platform secure(-ish) key/value store.
 *
 * - Native: expo-secure-store (Keychain / Keystore).
 * - Web: localStorage. Note: this is NOT as secure as Keychain/Keystore.
 *   For the PWA build, sensitive data (auth tokens) should ideally move to
 *   httpOnly cookies issued by the server. Until then, localStorage is the
 *   pragmatic choice so the existing code paths continue to work.
 */
export async function getItem(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      return window.localStorage.getItem(key);
    }
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Swallow: storage failures should never crash the app.
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Swallow.
  }
}
