import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BIOMETRICS_KEY = "vin_biometrics_enabled";

export async function isBiometricsAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  } catch {
    return false;
  }
}

export async function getBiometricType(): Promise<string> {
  if (Platform.OS === "web") return "";
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return "Face ID";
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return "Fingerprint";
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return "Iris";
    }
  } catch {}
  return "Biometrics";
}

export async function isBiometricsEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(BIOMETRICS_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BIOMETRICS_KEY, enabled ? "true" : "false");
  } catch {}
}

export async function authenticateWithBiometrics(promptMessage?: string): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage || "Sign in to Vin",
      cancelLabel: "Use Password",
      disableDeviceFallback: true,
      fallbackLabel: "",
    });
    return result.success;
  } catch {
    return false;
  }
}
