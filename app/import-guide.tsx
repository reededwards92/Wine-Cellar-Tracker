import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import { getApiUrl, queryClient } from "@/lib/query-client";
import { currentAuthToken } from "@/lib/auth-token";

function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.stepCard}>
      <View style={styles.stepHeader}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{step}</Text>
        </View>
        <Text style={styles.stepTitle}>{title}</Text>
      </View>
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>{"\u2022"}</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

export default function ImportGuideScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [importing, setImporting] = useState(false);

  const handleUpload = async () => {
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

      queryClient.invalidateQueries({ queryKey: ["/api/consumption"] });

      Alert.alert(
        "Import Complete",
        `${data.wines_created} wines and ${data.bottles_created} bottles imported.${data.consumed > 0 ? ` ${data.consumed} marked as consumed.` : ""}${data.skipped > 0 ? ` ${data.skipped} duplicates skipped.` : ""}${data.errors?.length > 0 ? `\n${data.errors.length} rows had errors.` : ""}`,
        [{ text: "Done", onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert("Import Failed", err.message || "Something went wrong");
    } finally {
      setImporting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Import Wine Data</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 + 80 : insets.bottom + 80 }]}>
        <Text style={styles.intro}>
          Export your wine collection from another app, then upload the CSV file here. Vin will automatically match the columns.
        </Text>

        <StepCard step={1} title="Log in to CellarTracker">
            <Bullet text="Go to cellartracker.com on a desktop browser and sign in" />
            <Bullet text="Note: the export feature is not available on the mobile app or mobile site" />
          </StepCard>

          <StepCard step={2} title="Open your cellar">
            <Bullet text='Click "My Cellar" in the top navigation' />
          </StepCard>

          <StepCard step={3} title="Export as CSV">
            <Bullet text='Click the "Export" button in the top right of the page' />
            <Bullet text="Select your desired columns in the export dialog" />
            <Bullet text='Choose "CSV" as the format and download the file' />
          </StepCard>

          <StepCard step={4} title="Upload to Vin">
            <Bullet text='Tap the "Upload CSV File" button below' />
            <Bullet text="Select the CSV file you just downloaded" />
            <Bullet text="Vin will automatically detect the CellarTracker format" />
          </StepCard>

        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.light.tint} />
          <Text style={styles.noteText}>
            Vin supports CSV files from any wine app. If your app isn't listed above, just export as CSV and upload it. Our AI will figure out the column mapping.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.uploadBar, { paddingBottom: isWeb ? 34 : insets.bottom + 12 }]}>
        <Pressable
          style={[styles.uploadBtn, importing && styles.uploadBtnDisabled]}
          onPress={handleUpload}
          disabled={importing}
        >
          {importing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
              <Text style={styles.uploadBtnText}>Upload CSV File</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: Colors.light.white,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.light.text,
  },
  content: {
    padding: 16,
  },
  intro: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    lineHeight: 22,
    marginBottom: 20,
  },
  stepCard: {
    backgroundColor: Colors.light.white,
    borderRadius: theme.radius.xl,
    ...theme.shadows.card,
    marginBottom: 12,
    overflow: "hidden",
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.cardBackground,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.light.text,
    flex: 1,
  },
  stepBody: {
    padding: 14,
    gap: 8,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  bulletDot: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  bulletText: {
    fontSize: 14,
    color: Colors.light.text,
    lineHeight: 20,
    flex: 1,
  },
  noteCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#F3E8E9",
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    alignItems: "flex-start",
  },
  noteText: {
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 19,
    flex: 1,
  },
  uploadBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: Colors.light.white,
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    paddingVertical: 16,
  },
  uploadBtnDisabled: {
    opacity: 0.6,
  },
  uploadBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
