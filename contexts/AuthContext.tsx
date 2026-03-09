import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getApiUrl, queryClient } from "@/lib/query-client";
import { setAuthToken } from "@/lib/auth-token";
import {
  isBiometricsAvailable,
  isBiometricsEnabled,
  authenticateWithBiometrics,
  setBiometricsEnabled,
  getBiometricType,
} from "@/lib/biometrics";

interface User {
  id: number;
  email: string;
  display_name: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  biometricsAvailable: boolean;
  biometricsEnabled: boolean;
  biometricType: string;
  hasStoredSession: boolean;
  biometricFailed: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  googleSignIn: (googleData: { email: string; name: string; google_id: string; id_token: string }) => Promise<void>;
  logout: () => Promise<void>;
  toggleBiometrics: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  biometricsAvailable: false,
  biometricsEnabled: false,
  biometricType: "",
  hasStoredSession: false,
  biometricFailed: false,
  login: async () => {},
  loginWithBiometrics: async () => {},
  register: async () => {},
  googleSignIn: async () => {},
  logout: async () => {},
  toggleBiometrics: async () => false,
});

const TOKEN_KEY = "vin_auth_token";

async function getStoredToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(TOKEN_KEY);
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function setStoredToken(token: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    }
  } catch {}
}

async function removeStoredToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.removeItem(TOKEN_KEY);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {}
}

async function restoreSession(storedToken: string): Promise<User | null> {
  setAuthToken(storedToken);
  try {
    const baseUrl = getApiUrl();
    const resp = await fetch(new URL("/api/auth/me", baseUrl).toString(), {
      headers: { Authorization: `Bearer ${storedToken}` },
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.user;
    }
  } catch {}
  setAuthToken(null);
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [biometricsAvailable, setBiometricsAvailableState] = useState(false);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [biometricType, setBiometricType] = useState("");
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [biometricFailed, setBiometricFailed] = useState(false);
  const [storedToken, setStoredTokenState] = useState<string | null>(null);

  const updateToken = useCallback(async (newToken: string | null) => {
    setAuthToken(newToken);
    setToken(newToken);
    setStoredTokenState(newToken);
    if (newToken) {
      await setStoredToken(newToken);
      setHasStoredSession(true);
    } else {
      await removeStoredToken();
      setHasStoredSession(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const available = await isBiometricsAvailable();
      setBiometricsAvailableState(available);
      if (available) {
        const type = await getBiometricType();
        setBiometricType(type);
        const enabled = await isBiometricsEnabled();
        setBiometricsEnabledState(enabled);
      }

      const stored = await getStoredToken();
      if (stored) {
        const bioEnabled = await isBiometricsEnabled();

        if (bioEnabled && available) {
          const authenticated = await authenticateWithBiometrics();
          if (authenticated) {
            const restoredUser = await restoreSession(stored);
            if (restoredUser) {
              setToken(stored);
              setStoredTokenState(stored);
              setUser(restoredUser);
              setHasStoredSession(true);
              setIsLoading(false);
              return;
            }
            await removeStoredToken();
          } else {
            setStoredTokenState(stored);
            setHasStoredSession(true);
            setBiometricFailed(true);
          }
          setIsLoading(false);
          return;
        }

        if (bioEnabled && !available) {
          await setBiometricsEnabled(false);
          setBiometricsEnabledState(false);
          await removeStoredToken();
          setIsLoading(false);
          return;
        }

        setStoredTokenState(stored);
        setHasStoredSession(true);
      }
      setIsLoading(false);
    })();
  }, []);

  const loginWithBiometrics = useCallback(async () => {
    if (!storedToken) throw new Error("No stored session");
    const authenticated = await authenticateWithBiometrics();
    if (!authenticated) throw new Error("Authentication cancelled");

    const restoredUser = await restoreSession(storedToken);
    if (restoredUser) {
      setToken(storedToken);
      setUser(restoredUser);
      setBiometricFailed(false);
      queryClient.clear();
    } else {
      await removeStoredToken();
      setHasStoredSession(false);
      setStoredTokenState(null);
      throw new Error("Session expired. Please sign in with your password.");
    }
  }, [storedToken]);

  const login = useCallback(async (email: string, password: string) => {
    const baseUrl = getApiUrl();
    const resp = await fetch(new URL("/api/auth/login", baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.message || "Login failed");
    }

    const data = await resp.json();
    await updateToken(data.token);
    setUser(data.user);
    setBiometricFailed(false);
    queryClient.clear();
  }, [updateToken]);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const baseUrl = getApiUrl();
    const resp = await fetch(new URL("/api/auth/register", baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, display_name: displayName }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.message || "Registration failed");
    }

    const data = await resp.json();
    await updateToken(data.token);
    setUser(data.user);
    queryClient.clear();
  }, [updateToken]);

  const googleSignIn = useCallback(async (googleData: { email: string; name: string; google_id: string; id_token: string }) => {
    const baseUrl = getApiUrl();
    const resp = await fetch(new URL("/api/auth/google", baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(googleData),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.message || "Google sign-in failed");
    }

    const data = await resp.json();
    await updateToken(data.token);
    setUser(data.user);
    queryClient.clear();
  }, [updateToken]);

  const logout = useCallback(async () => {
    await updateToken(null);
    setUser(null);
    setBiometricFailed(false);
    queryClient.clear();
  }, [updateToken]);

  const toggleBiometrics = useCallback(async (): Promise<boolean> => {
    if (!biometricsAvailable) return false;

    if (biometricsEnabled) {
      await setBiometricsEnabled(false);
      setBiometricsEnabledState(false);
      return false;
    }

    const success = await authenticateWithBiometrics("Verify to enable " + biometricType);
    if (success) {
      await setBiometricsEnabled(true);
      setBiometricsEnabledState(true);
      return true;
    }
    return false;
  }, [biometricsAvailable, biometricsEnabled, biometricType]);

  return (
    <AuthContext.Provider value={{
      user, token, isLoading,
      biometricsAvailable, biometricsEnabled, biometricType,
      hasStoredSession, biometricFailed,
      login, loginWithBiometrics, register, googleSignIn, logout, toggleBiometrics,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
