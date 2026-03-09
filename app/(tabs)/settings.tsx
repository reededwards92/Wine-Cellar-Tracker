import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { currentAuthToken } from "@/lib/auth-token";

function SettingsRow({
  icon,
  label,
  subtitle,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
      onPress={onPress}
      disabled={!onPress}
    >
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
      {onPress ? (
        <Ionicons name="chevron-forward" size={16} color={Colors.light.tabIconDefault} />
      ) : null}
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
  const { user, logout } = useAuth();
  const [exporting, setExporting] = useState(false);

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
        const fileUri = FileSystem.documentDirectory + "vin-cellar-export.xlsx";
        const downloadResult = await FileSystem.downloadAsync(exportUrl, fileUri, {
          headers: currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {},
        });

        if (downloadResult.status !== 200) {
          throw new Error("Export download failed");
        }

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
    <View style={styles.screen}>
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

        <SettingsSection title="Cellar">
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

        <SettingsSection title="">
          <SettingsRow
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleLogout}
            destructive
          />
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
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
    color: Colors.light.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionContent: {
    backgroundColor: Colors.light.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
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
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
});
