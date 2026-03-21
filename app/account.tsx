import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { getApiUrl } from "@/lib/query-client";
import { currentAuthToken } from "@/lib/auth-token";

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const { user, logout } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name || "");
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSaveName = async () => {
    if (!displayName.trim()) {
      Alert.alert("Error", "Display name cannot be empty");
      return;
    }
    setSavingName(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/auth/profile", baseUrl).toString(), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {}),
        },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to update name");
      }
      Alert.alert("Saved", "Display name updated");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to update name");
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      Alert.alert("Error", "Please fill in all password fields");
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(new URL("/api/auth/change-password", baseUrl).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {}),
        },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to change password");
      }
      Alert.alert("Saved", "Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to change password");
    } finally {
      setChangingPassword(false);
    }
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

  const nameChanged = displayName.trim() !== (user?.display_name || "");

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: isWeb ? 67 : insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: isWeb ? 34 : insets.bottom + 20 }]}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PROFILE</Text>
          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={styles.emailRow}>
                <Text style={styles.emailText}>{user?.email}</Text>
              </View>
            </View>
            <View style={styles.separator} />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Display Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor="rgba(94, 38, 38, 0.38)"
                autoCapitalize="words"
              />
            </View>
            {nameChanged ? (
              <Pressable style={styles.saveBtn} onPress={handleSaveName} disabled={savingName}>
                {savingName ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Name</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CHANGE PASSWORD</Text>
          <View style={styles.card}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Current Password</Text>
              <TextInput
                style={styles.input}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="Enter current password"
                placeholderTextColor="rgba(94, 38, 38, 0.38)"
                secureTextEntry
              />
            </View>
            <View style={styles.separator} />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>New Password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Enter new password"
                placeholderTextColor="rgba(94, 38, 38, 0.38)"
                secureTextEntry
              />
            </View>
            <View style={styles.separator} />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm new password"
                placeholderTextColor="rgba(94, 38, 38, 0.38)"
                secureTextEntry
              />
            </View>
            <Pressable
              style={[styles.saveBtn, (!currentPassword || !newPassword || !confirmPassword) && styles.saveBtnDisabled]}
              onPress={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
            >
              {changingPassword ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Update Password</Text>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Pressable style={styles.deleteBtn} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={18} color={Colors.light.danger} />
            <Text style={styles.deleteBtnText}>Delete Account</Text>
          </Pressable>
          <Text style={styles.deleteHint}>
            Permanently removes your account and all wine data
          </Text>
        </View>
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
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.light.textSecondary,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.light.cardBackground,
    borderRadius: theme.radius.xl,
    ...theme.shadows.card,
    overflow: "hidden",
  },
  field: {
    padding: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.light.textSecondary,
    marginBottom: 6,
  },
  emailRow: {
    paddingVertical: 4,
  },
  emailText: {
    fontSize: 15,
    color: Colors.light.text,
  },
  input: {
    fontSize: 15,
    color: Colors.light.text,
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginHorizontal: 14,
  },
  saveBtn: {
    margin: 14,
    marginTop: 6,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.danger,
    backgroundColor: Colors.light.white,
  },
  deleteBtnText: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.light.danger,
  },
  deleteHint: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
});
