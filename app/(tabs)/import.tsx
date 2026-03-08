import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient } from "@/lib/query-client";
import type { ImportPreview, ImportResult } from "@/lib/api";

type ImportState = "idle" | "previewing" | "importing" | "done";

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [state, setState] = useState<ImportState>("idle");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string } | null>(null);

  const pickFile = async () => {
    try {
      const docResult = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "application/csv", "*/*"],
        copyToCacheDirectory: true,
      });

      if (docResult.canceled) return;
      const file = docResult.assets[0];
      setSelectedFile({ uri: file.uri, name: file.name });
      setError(null);
      setResult(null);

      setState("previewing");

      const baseUrl = getApiUrl();
      const url = new URL("/api/import?preview=true", baseUrl);
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: "text/csv",
      } as any);

      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data = await res.json();
      setPreview(data);
      setState("idle");
    } catch (err: any) {
      setError(err.message);
      setState("idle");
    }
  };

  const runImport = async () => {
    if (!selectedFile) return;
    setState("importing");
    setError(null);

    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/import", baseUrl);
      const formData = new FormData();
      formData.append("file", {
        uri: selectedFile.uri,
        name: selectedFile.name,
        type: "text/csv",
      } as any);

      const res = await fetch(url.toString(), {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }

      const data: ImportResult = await res.json();
      setResult(data);
      setState("done");
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/filters"] });
    } catch (err: any) {
      setError(err.message);
      setState("idle");
    }
  };

  const reset = () => {
    setState("idle");
    setPreview(null);
    setResult(null);
    setSelectedFile(null);
    setError(null);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 12 }]}>
        <Text style={styles.title}>Import</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: isWeb ? 84 + 34 : insets.bottom + 100 },
        ]}
      >
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.light.tint} />
          <Text style={styles.infoText}>
            Upload your CellarTracker CSV export (My_Bottles.csv). The import handles latin-1 encoding and will deduplicate based on inventory IDs.
          </Text>
        </View>

        {!selectedFile ? (
          <Pressable style={styles.uploadArea} onPress={pickFile}>
            <Ionicons name="cloud-upload-outline" size={40} color={Colors.light.tint} />
            <Text style={styles.uploadTitle}>Select CSV File</Text>
            <Text style={styles.uploadSubtext}>Tap to browse files</Text>
          </Pressable>
        ) : null}

        {state === "previewing" ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <Text style={styles.loadingText}>Reading file...</Text>
          </View>
        ) : null}

        {preview && state === "idle" && selectedFile ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Preview</Text>
            <Text style={styles.fileName}>{selectedFile.name}</Text>

            <View style={styles.previewStats}>
              <View style={styles.previewStat}>
                <Text style={styles.previewStatValue}>{preview.total_rows}</Text>
                <Text style={styles.previewStatLabel}>Total Rows</Text>
              </View>
              <View style={styles.previewStat}>
                <Text style={styles.previewStatValue}>{preview.unique_wines}</Text>
                <Text style={styles.previewStatLabel}>Unique Wines</Text>
              </View>
            </View>

            {preview.preview.length > 0 ? (
              <View style={styles.previewTable}>
                <Text style={styles.tableTitle}>First rows:</Text>
                {preview.preview.slice(0, 5).map((row: any, i: number) => (
                  <View key={i} style={styles.tableRow}>
                    <Text style={styles.tableProducer} numberOfLines={1}>{row.Producer}</Text>
                    <Text style={styles.tableWine} numberOfLines={1}>{row.Wine}</Text>
                    <Text style={styles.tableVintage}>{row.Vintage}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.importActions}>
              <Pressable style={styles.cancelBtn} onPress={reset}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.importBtn} onPress={runImport}>
                <Ionicons name="download-outline" size={18} color="#fff" />
                <Text style={styles.importBtnText}>Import {preview.total_rows} bottles</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {state === "importing" ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <Text style={styles.loadingText}>Importing wines...</Text>
          </View>
        ) : null}

        {result && state === "done" ? (
          <View style={styles.resultCard}>
            <Ionicons name="checkmark-circle" size={40} color={Colors.light.success} />
            <Text style={styles.resultTitle}>Import Complete</Text>

            <View style={styles.resultStats}>
              <View style={styles.resultStat}>
                <Text style={styles.resultStatValue}>{result.wines_created}</Text>
                <Text style={styles.resultStatLabel}>Wines Created</Text>
              </View>
              <View style={styles.resultStat}>
                <Text style={styles.resultStatValue}>{result.bottles_created}</Text>
                <Text style={styles.resultStatLabel}>Bottles Added</Text>
              </View>
              <View style={styles.resultStat}>
                <Text style={styles.resultStatValue}>{result.skipped}</Text>
                <Text style={styles.resultStatLabel}>Skipped</Text>
              </View>
            </View>

            {result.errors.length > 0 ? (
              <View style={styles.errorsBox}>
                <Text style={styles.errorsTitle}>{result.errors.length} errors:</Text>
                {result.errors.slice(0, 5).map((e, i) => (
                  <Text key={i} style={styles.errorItem}>{e}</Text>
                ))}
                {result.errors.length > 5 ? (
                  <Text style={styles.errorItem}>...and {result.errors.length - 5} more</Text>
                ) : null}
              </View>
            ) : null}

            <Pressable style={styles.doneBtn} onPress={reset}>
              <Text style={styles.doneBtnText}>Import Another File</Text>
            </Pressable>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={24} color={Colors.light.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={reset}>
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.cardBackground,
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
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
  },
  content: {
    padding: 16,
  },
  infoCard: {
    flexDirection: "row",
    backgroundColor: Colors.light.white,
    borderRadius: 8,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  uploadArea: {
    backgroundColor: Colors.light.white,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed" as const,
    borderColor: Colors.light.border,
    paddingVertical: 48,
    alignItems: "center",
    gap: 8,
  },
  uploadTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  uploadSubtext: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  previewCard: {
    backgroundColor: Colors.light.white,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  previewTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
    marginBottom: 4,
  },
  fileName: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  previewStats: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  previewStat: {
    flex: 1,
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  previewStatValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.tint,
  },
  previewStatLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  previewTable: {
    marginBottom: 16,
  },
  tableTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.textSecondary,
    marginBottom: 6,
    textTransform: "uppercase" as const,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    gap: 8,
  },
  tableProducer: {
    flex: 2,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.text,
  },
  tableWine: {
    flex: 3,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
  },
  tableVintage: {
    width: 40,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.text,
    textAlign: "right" as const,
  },
  importActions: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: Colors.light.textSecondary,
  },
  importBtn: {
    flex: 2,
    flexDirection: "row",
    backgroundColor: Colors.light.tint,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  importBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  resultCard: {
    backgroundColor: Colors.light.white,
    borderRadius: 8,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
    alignItems: "center",
  },
  resultTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.light.text,
    marginTop: 8,
    marginBottom: 16,
  },
  resultStats: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
    width: "100%",
  },
  resultStat: {
    flex: 1,
    backgroundColor: Colors.light.cardBackground,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  resultStatValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.light.tint,
  },
  resultStatLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  errorsBox: {
    width: "100%",
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorsTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.light.danger,
    marginBottom: 4,
  },
  errorItem: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.light.danger,
    marginTop: 2,
  },
  doneBtn: {
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  doneBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  errorCard: {
    backgroundColor: Colors.light.white,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.danger,
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.light.danger,
    textAlign: "center",
  },
  retryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.light.text,
  },
});
