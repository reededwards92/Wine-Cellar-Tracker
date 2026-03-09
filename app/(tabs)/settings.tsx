import React from "react";
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
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

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
            subtitle={user?.display_name ? user.email : undefined}
          />
        </SettingsSection>

        <SettingsSection title="Cellar">
          <SettingsRow
            icon="cloud-upload-outline"
            label="Import CellarTracker CSV"
            subtitle="Add wines from a CellarTracker export"
          />
          <SettingsRow
            icon="download-outline"
            label="Export Cellar Data"
            subtitle="Download your cellar as CSV"
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
