import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();

  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const baseUrl = getApiUrl();
      const resp = await fetch(new URL("/api/auth/forgot-password", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "Request failed");
      setPhase("code");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!code.trim() || !newPassword) {
      setError("Please enter the code and your new password");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const baseUrl = getApiUrl();
      const resp = await fetch(new URL("/api/auth/reset-password", baseUrl).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim(), new_password: newPassword }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "Reset failed");
      router.replace("/(auth)/login");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: isWeb ? 67 + 40 : insets.top + 60,
            paddingBottom: isWeb ? 34 + 20 : insets.bottom + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.backRow} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={Colors.light.tint} />
          <Text style={styles.backText}>Back to Sign In</Text>
        </Pressable>

        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="lock-closed-outline" size={30} color={Colors.light.white} />
          </View>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>
            {phase === "email"
              ? "Enter your email and we'll send you a reset code"
              : `We sent a 6-digit code to ${email}`}
          </Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.light.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {phase === "email" ? (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={Colors.light.tabIconDefault}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleSendCode}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.light.white} size="small" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Code</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.infoBox}>
                <Ionicons name="mail-outline" size={16} color={Colors.light.tint} />
                <Text style={styles.infoText}>Check your email for a 6-digit code. It expires in 15 minutes.</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Reset Code</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={setCode}
                  placeholder="000000"
                  placeholderTextColor={Colors.light.tabIconDefault}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>New Password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="At least 6 characters"
                    placeholderTextColor={Colors.light.tabIconDefault}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <Pressable style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons
                      name={showPassword ? "eye-off" : "eye"}
                      size={20}
                      color={Colors.light.tabIconDefault}
                    />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  loading && styles.buttonDisabled,
                ]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.light.white} size="small" />
                ) : (
                  <Text style={styles.buttonText}>Reset Password</Text>
                )}
              </Pressable>

              <Pressable style={styles.resendRow} onPress={() => { setPhase("email"); setCode(""); setError(""); }}>
                <Text style={styles.resendText}>Didn't get it? <Text style={styles.resendLink}>Try again</Text></Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 32,
  },
  backText: {
    fontSize: 14,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.tint,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  form: {
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.danger,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: Colors.light.tint + "15",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.tint,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.white,
  },
  codeInput: {
    fontSize: 24,
    fontFamily: "Outfit_700Bold",
    letterSpacing: 6,
    textAlign: "center",
  },
  passwordRow: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 48,
  },
  eyeButton: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    height: 50,
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.white,
  },
  resendRow: {
    alignItems: "center",
    marginTop: 20,
    padding: 8,
  },
  resendText: {
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  resendLink: {
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.tint,
  },
});
