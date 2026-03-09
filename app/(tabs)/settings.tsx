import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { queryClient } from "@/lib/query-client";
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
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (importing) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "text/plain"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setImporting(true);

      const baseUrl = getApiUrl();
      const importUrl = new URL("/api/import", baseUrl).toString();

      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name || "import.csv",
        type: "text/csv",
      } as any);

      const headers: Record<string, string> = {};
      if (currentAuthToken) {
        headers["Authorization"] = `Bearer ${currentAuthToken}`;
      }

      const res = await fetch(importUrl, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Import failed" }));
        throw new Error(errorData.error || "Import failed");
      }

      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filters"] });

      Alert.alert(
        "Import Complete",
        `${data.wines_created} wines and ${data.bottles_created} bottles imported.${data.skipped > 0 ? ` ${data.skipped} duplicates skipped.` : ""}${data.errors?.length > 0 ? `\n${data.errors.length} rows had errors.` : ""}`
      );
    } catch (err: any) {
      Alert.alert("Import Failed", err.message || "Something went wrong");
    } finally {
      setImporting(false);
    }
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

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete your account and all your wine data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: async () => {
            try {
              const baseUrl = getApiUrl();
              const res = await fetch(new URL("/api/auth/account", baseUrl).toString(), {
                method: "DELETE",
                headers: currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {},
              });
              if (!res.ok) throw new Error("Failed to delete account");
              logout();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to delete account");
            }
          },
        },
      ]
    );
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
            subtitle={user?.display_name ? user.email : undefined}
          />
        </SettingsSection>

        <SettingsSection title="Cellar">
          <SettingsRow
            icon="cloud-upload-outline"
            label={importing ? "Importing..." : "Import Wine Data"}
            subtitle="Upload a CSV from any wine app"
            onPress={handleImport}
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
          <SettingsRow
            icon="trash-outline"
            label="Delete Account"
            subtitle="Permanently remove account and data"
            onPress={handleDeleteAccount}
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
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionContent: {
    backgroundColor: Colors.light.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: "hidden" as const,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
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
    alignItems: "center" as const,
    justifyContent: "center" as const,
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
