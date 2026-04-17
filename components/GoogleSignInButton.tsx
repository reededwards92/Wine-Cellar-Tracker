import React, { useEffect } from "react";
import { Pressable, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import Colors from "@/constants/colors";

WebBrowser.maybeCompleteAuthSession();

interface GoogleSignInButtonProps {
  onSignIn: (data: {
    email: string;
    name: string;
    google_id: string;
    id_token: string;
  }) => Promise<void>;
  onError: (message: string) => void;
  onLoadingChange: (loading: boolean) => void;
  loading: boolean;
  containerStyle?: any;
}

/**
 * Google OAuth button, gated on EXPO_PUBLIC_GOOGLE_CLIENT_ID being present.
 *
 * `Google.useAuthRequest` crashes on web if clientId is undefined — so we
 * extract it into a child component that only mounts (and thus calls the
 * hook) when the env var is actually configured.
 */
export function GoogleSignInButton(props: GoogleSignInButtonProps) {
  const clientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  return <GoogleSignInButtonInner {...props} clientId={clientId} />;
}

function GoogleSignInButtonInner({
  onSignIn,
  onError,
  onLoadingChange,
  loading,
  containerStyle,
  clientId,
}: GoogleSignInButtonProps & { clientId: string }) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type !== "success") return;
    const { authentication } = response;
    if (!authentication?.accessToken) return;

    onLoadingChange(true);
    fetch("https://www.googleapis.com/userinfo/v2/me", {
      headers: { Authorization: `Bearer ${authentication.accessToken}` },
    })
      .then((r) => r.json())
      .then(async (info) => {
        await onSignIn({
          email: info.email,
          name: info.name || "",
          google_id: info.id,
          id_token: authentication.idToken || "",
        });
      })
      .catch((e: any) => {
        onError(e?.message || "Google sign-in failed");
        onLoadingChange(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return (
    <>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.googleButton,
          pressed && styles.googleButtonPressed,
          containerStyle,
        ]}
        onPress={() => promptAsync()}
        disabled={!request || loading}
      >
        <Ionicons name="logo-google" size={18} color={Colors.light.text} />
        <Text style={styles.googleButtonText}>Continue with Google</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(94, 38, 38, 0.12)",
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(94, 38, 38, 0.15)",
    backgroundColor: "#fff",
  },
  googleButtonPressed: {
    opacity: 0.8,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.light.text,
  },
});
