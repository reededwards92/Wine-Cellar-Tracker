import React, { useState, useEffect } from "react";
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
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const router = useRouter();
  const { login, googleSignIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const { authentication } = googleResponse;
      if (!authentication?.accessToken) return;
      setLoading(true);
      fetch("https://www.googleapis.com/userinfo/v2/me", {
        headers: { Authorization: `Bearer ${authentication.accessToken}` },
      })
        .then((r) => r.json())
        .then(async (info) => {
          await googleSignIn({ email: info.email, name: info.name || "", google_id: info.id, id_token: authentication.idToken || "" });
          router.replace("/(tabs)");
        })
        .catch((e: any) => { setError(e.message || "Google sign-in failed"); setLoading(false); });
    }
  }, [googleResponse]);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Please enter your email and password");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message || "Login failed");
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
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="wine" size={36} color={Colors.light.white} />
          </View>
          <Text style={styles.appName}>Vin</Text>
          <Text style={styles.tagline}>Your personal wine cellar</Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.light.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

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
              testID="login-email"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={Colors.light.tabIconDefault}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                testID="login-password"
              />
              <Pressable
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={20}
                  color={Colors.light.tabIconDefault}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={styles.forgotRow}
            onPress={() => router.push("/(auth)/forgot-password")}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.loginButton,
              pressed && styles.loginButtonPressed,
              loading && styles.loginButtonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
            testID="login-submit"
          >
            {loading ? (
              <ActivityIndicator color={Colors.light.white} size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed]}
            onPress={() => promptGoogleAsync()}
            disabled={!googleRequest || loading}
          >
            <Ionicons name="logo-google" size={18} color={Colors.light.text} />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.registerLink,
              pressed && styles.registerLinkPressed,
            ]}
            onPress={() => router.push("/(auth)/register")}
          >
            <Text style={styles.registerLinkText}>
              Don't have an account?{" "}
              <Text style={styles.registerLinkBold}>Create one</Text>
            </Text>
          </Pressable>
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
  appName: {
    fontSize: 32,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.tint,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
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
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.white,
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
  loginButton: {
    height: 50,
    backgroundColor: Colors.light.tint,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  loginButtonPressed: {
    opacity: 0.85,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.white,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.light.border,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.tabIconDefault,
    marginHorizontal: 16,
  },
  registerLink: {
    alignItems: "center",
    padding: 12,
  },
  registerLinkPressed: {
    opacity: 0.7,
  },
  registerLinkText: {
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
  },
  registerLinkBold: {
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.tint,
  },
  forgotRow: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    marginBottom: 4,
  },
  forgotText: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
  googleButton: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    backgroundColor: Colors.light.white,
  },
  googleButtonPressed: {
    backgroundColor: Colors.light.cardBackground,
  },
  googleButtonText: {
    fontSize: 15,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.text,
  },
});
