import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  Alert,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import * as Linking from "expo-linking";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { currentAuthToken } from "@/lib/auth-token";

function SettingsRow({
  icon,
  label,
  subtitle,
  onPress,
  destructive,
  toggle,
  toggleValue,
  onToggle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  destructive?: boolean;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (val: boolean) => void;
}) {
  const content = (
    <>
      <View style={[styles.rowIcon, destructive && styles.rowIconDestructive]}>
        <Ionicons
          name={icon}
          size={20}
          color={destructive ? Colors.light.danger : Colors.light.tint}
        />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>
          {label}
        </Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {toggle ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ false: Colors.light.border, true: Colors.light.tint }}
          thumbColor={Colors.light.white}
        />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={16} color="rgba(114,47,55,0.35)" />
      ) : null}
    </>
  );

  if (toggle) {
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => onToggle?.(!toggleValue)}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
      onPress={onPress}
      disabled={!onPress}
    >
      {content}
    </Pressable>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, logout, biometricsAvailable, biometricsEnabled, biometricType, toggleBiometrics } = useAuth();
  const [exporting, setExporting] = useState(false);

  const handleBiometricsToggle = async (_val: boolean) => {
    await toggleBiometrics();
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const baseUrl = getApiUrl();
      const exportUrl = new URL("/api/export", baseUrl).toString();

      if (Platform.OS === "web") {
        const res = await fetch(exportUrl, {
          headers: currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {},
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "vin-cellar-export.xlsx";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const res = await fetch(exportUrl, {
          headers: currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {},
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();

        const FileSystemLegacy = await import("expo-file-system/legacy");
        const fileUri = FileSystemLegacy.cacheDirectory + "vin-cellar-export.xlsx";
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        await FileSystemLegacy.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            dialogTitle: "Export Cellar Data",
          });
        } else {
          Alert.alert("Exported", "File saved to device");
        }
      }
    } catch (err: any) {
      Alert.alert("Export Failed", err.message || "Something went wrong");
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      logout();
      return;
    }
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => logout() },
    ]);
  };

  return (
    <LinearGradient
      colors={[Colors.light.bgGradientStart, Colors.light.bgGradientEnd]}
      style={styles.screen}
    >
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: isWeb ? 84 + 34 : insets.bottom + 90 },
        ]}
      >
        <SettingsSection title="Account">
          <SettingsRow
            icon="person-outline"
            label={user?.display_name || user?.email || "Account"}
            subtitle={user?.display_name ? user.email : "Manage your account"}
            onPress={() => router.push("/account")}
          />
        </SettingsSection>

        {biometricsAvailable ? (
          <SettingsSection title="Security">
            <SettingsRow
              icon={biometricType === "Face ID" ? "scan-outline" : "finger-print-outline"}
              label={biometricType || "Biometric Login"}
              subtitle={biometricsEnabled ? "Enabled" : "Use " + (biometricType || "biometrics") + " to sign in"}
              toggle
              toggleValue={biometricsEnabled}
              onToggle={handleBiometricsToggle}
            />
          </SettingsSection>
        ) : null}

        <SettingsSection title="Cellar">
          <SettingsRow
            icon="location-outline"
            label="Storage Locations"
            subtitle="Set up your racks, fridges, and more"
            onPress={() => router.push("/storage-locations")}
          />
          <SettingsRow
            icon="cloud-upload-outline"
            label="Import Wine Data"
            subtitle="Upload a CSV from any wine app"
            onPress={() => router.push("/import-guide")}
          />
          <SettingsRow
            icon="download-outline"
            label={exporting ? "Exporting..." : "Export Cellar Data"}
            subtitle="Download your cellar as Excel"
            onPress={handleExport}
          />
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsRow
            icon="wine-outline"
            label="Vin"
            subtitle="Wine Cellar Management"
          />
          <SettingsRow
            icon="information-circle-outline"
            label="Version"
            subtitle="1.0.0"
          />
        </SettingsSection>

        <SettingsSection title="Legal">
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => {
              const url = new URL("/privacy", getApiUrl()).toString();
              Linking.openURL(url);
            }}
          />
          <SettingsRow
            icon="document-text-outline"
            label="Terms of Service"
            onPress={() => {
              const url = new URL("/terms", getApiUrl()).toString();
              Linking.openURL(url);
            }}
          />
          <SettingsRow
            icon="help-circle-outline"
            label="Support"
            onPress={() => {
              const url = new URL("/support", getApiUrl()).toString();
              Linking.openURL(url);
            }}
          />
          <SettingsRow
            icon="bug-outline"
            label="Report a Bug"
            subtitle="Send feedback to the developer"
            onPress={() => {
              const subject = encodeURIComponent("Vin Bug Report");
              const body = encodeURIComponent(
                "Describe the bug:\n\n" +
                "Steps to reproduce:\n\n" +
                "What you expected to happen:\n\n" +
                "App version: 1.0.0"
              );
              Linking.openURL(`mailto:reededwards92@gmail.com?subject=${subject}&body=${body}`);
            }}
          />
        </SettingsSection>

        <SettingsSection title="">
          <SettingsRow
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleLogout}
            destructive
          />
        </SettingsSection>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "transparent",
  },
  title: {
    fontSize: 28,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
  },
  listContent: {
    flexGrow: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Outfit_600SemiBold",
    color: "rgba(114, 47, 55, 0.55)",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionContent: {
    backgroundColor: "rgba(255, 255, 255, 0.62)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(114, 47, 55, 0.10)",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(114,47,55,0.07)",
  },
  rowPressed: {
    backgroundColor: Colors.light.cardBackground,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.light.cardBackground,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowIconDestructive: {
    backgroundColor: "#FEF2F2",
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
  rowLabelDestructive: {
    color: Colors.light.danger,
  },
  rowSubtitle: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: "rgba(45,18,21,0.50)",
    marginTop: 1,
  },
});
