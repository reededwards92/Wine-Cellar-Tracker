import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  Linking,
  Image,
  Alert,
  Animated,
  Easing,
  Keyboard,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetch } from "expo/fetch";
import { useLocalSearchParams, useRouter } from "expo-router";
import Markdown from "react-native-markdown-display";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import CruMeshBackground from "@/components/CruMeshBackground";
import { BlurView } from "expo-blur";
import Colors from "@/constants/colors";
import { theme } from "@/constants/theme";
import CruMark, { type CruMarkState } from "@/components/CruMark";
import CruThinking from "@/components/CruThinking";
import { getApiUrl, queryClient } from "@/lib/query-client";
import { useCruInsights } from "@/contexts/CruInsightsContext";

// Cru tab color palette
const CruColors = {
  gradientTop: "#6B2A32",
  gradientMid: "#722F37",
  gradientBlush: "#C4787F",
  gradientBottom: "#FDF6F4",
  textPrimary: "#1A0A0C",
  textSecondary: "rgba(45,18,21,0.55)",
  glassBg: "rgba(255,255,255,0.72)",
  glassBorder: "rgba(255,255,255,0.7)",
  accent: "#722F37",
  accentMuted: "rgba(114,47,55,0.2)",
  warmShadow: "#2D1215",
};

interface WineCard {
  id: number;
  producer: string;
  wine_name: string;
  vintage?: number;
  color?: string;
  region?: string;
  varietal?: string;
  score?: number;
  bottle_count?: number;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUri?: string;
  imageBase64?: string;
  imageMimeType?: string;
  wineCards?: WineCard[];
}

let messageCounter = 0;
function generateUniqueId(): string {
  messageCounter++;
  return `msg-${Date.now()}-${messageCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

export default function SommelierScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const { markSeen } = useCruInsights();

  useEffect(() => { markSeen(); }, [markSeen]);
  const params = useLocalSearchParams<{ query?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [cruState, setCruState] = useState<CruMarkState>("idle");
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [hasStartedResponse, setHasStartedResponse] = useState(false);
  const streamingMessageIdRef = useRef<string | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const celebrateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingQueryRef = useRef<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{
    uri: string;
    base64: string;
    mimeType: string;
  } | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    "pending" | "granted" | "denied" | "unavailable"
  >("pending");
  const [undoToast, setUndoToast] = useState<{
    bottle_id: number;
    message: string;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoFadeAnim = useRef(new Animated.Value(0)).current;
  const [homeData, setHomeData] = useState<any>(null);
  const [homeLoading, setHomeLoading] = useState(false);

  const fetchHomeData = useCallback(async () => {
    try {
      setHomeLoading(true);
      const baseUrl = getApiUrl();
      const { currentAuthToken } = await import("@/lib/auth-token");
      const res = await fetch(new URL("/api/cru/home", baseUrl).toString(), {
        headers: currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {},
      });
      if (res.ok) {
        setHomeData(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch home data:", e);
    } finally {
      setHomeLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") {
        try {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                setUserLocation({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                });
                setLocationStatus("granted");
              },
              () => setLocationStatus("denied")
            );
          } else {
            setLocationStatus("unavailable");
          }
        } catch {
          setLocationStatus("unavailable");
        }
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        setLocationStatus("granted");
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Low,
          });
          setUserLocation({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        } catch {
          setLocationStatus("granted");
        }
      } else {
        setLocationStatus("denied");
      }
    })();

    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (params.query && !isStreaming) {
      const q = params.query as string;
      if (pendingQueryRef.current !== q) {
        pendingQueryRef.current = q;
        setInputText(q);
        setTimeout(() => {
          pendingQueryRef.current = null;
        }, 2000);
      }
    }
  }, [params.query]);

  const pickImage = async (useCamera: boolean) => {
    if (isStreaming) return;

    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Camera access needed", "Please enable camera access in your device settings to take photos of wine bottles.");
        return;
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 0.7,
      base64: true,
      allowsEditing: false,
    };

    const result = useCamera
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const mime = asset.mimeType || "image/jpeg";
        setPendingImage({ uri: asset.uri, base64: asset.base64, mimeType: mime });
        inputRef.current?.focus();
      }
    }
  };

  const showUndoToast = (data: { bottle_id: number; message: string }) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast(data);
    Animated.timing(undoFadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
    undoTimerRef.current = setTimeout(() => {
      Animated.timing(undoFadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => setUndoToast(null));
    }, 8000);
  };

  const handleUndo = async () => {
    if (!undoToast) return;
    const bottleId = undoToast.bottle_id;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    Animated.timing(undoFadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setUndoToast(null));
    try {
      const { apiRequest } = await import("@/lib/query-client");
      await apiRequest("POST", "/api/consumption/undo", { bottle_id: bottleId });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption/stats"] });
      setMessages((prev) => [
        ...prev,
        {
          id: generateUniqueId(),
          role: "assistant",
          content: "Got it, I've undone that consumption. The bottle is back in your cellar.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: generateUniqueId(),
          role: "assistant",
          content: "Sorry, I couldn't undo that consumption. You can restore it from your History tab.",
        },
      ]);
    }
  };

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText || inputText).trim();
    const image = overrideText ? null : pendingImage;
    if ((!text && !image) || isStreaming) return;

    const currentMessages = [...messages];
    const userMessage: Message = {
      id: generateUniqueId(),
      role: "user",
      content: text || (image ? "What can you tell me about this wine?" : ""),
      imageUri: image?.uri,
      imageBase64: image?.base64,
      imageMimeType: image?.mimeType,
    };

    if (!overrideText) {
      setInputText("");
      setPendingImage(null);
    }
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setShowTyping(true);
    setActiveTools([]);
    setCruState("thinking");
    setHasStartedResponse(false);

    let fullContent = "";
    let assistantAdded = false;
    let pendingWineCards: WineCard[] = [];

    try {
      const baseUrl = getApiUrl();

      // Keep last 20 messages to avoid exceeding context limits on long sessions
      const recentMessages = currentMessages.slice(-20);
      const chatHistory = recentMessages.map((m) => {
        if (m.imageBase64) {
          return { role: m.role, content: m.content, hadImage: true };
        }
        return { role: m.role, content: m.content };
      });
      const newMsg: any = { role: "user", content: userMessage.content };
      if (image) {
        newMsg.image = image.base64;
        newMsg.mimeType = image.mimeType;
      }
      chatHistory.push(newMsg);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const { currentAuthToken } = await import("@/lib/auth-token");
      const response = await fetch(new URL("/api/chat", baseUrl).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {}),
        },
        body: JSON.stringify({
          messages: chatHistory,
          location: userLocation || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        console.error(`Chat API error: ${response.status} ${errorText}`);
        throw new Error(`Chat request failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.tool_call) {
              setActiveTools((prev) => [...prev, parsed.tool_call]);
              continue;
            }

            if (parsed.consumption_completed) {
              showUndoToast(parsed.consumption_completed);
              setCruState("celebrating");
              if (celebrateTimerRef.current) clearTimeout(celebrateTimerRef.current);
              celebrateTimerRef.current = setTimeout(() => setCruState("speaking"), 2000);
              continue;
            }

            if (parsed.wine_cards) {
              pendingWineCards = parsed.wine_cards;
              continue;
            }

            if (parsed.error) {
              fullContent += parsed.error;
            }

            if (parsed.content) {
              fullContent += parsed.content;

              if (!assistantAdded) {
                const newMsgId = generateUniqueId();
                streamingMessageIdRef.current = newMsgId;
                setStreamingMessageId(newMsgId);
                setHasStartedResponse(true);
                setActiveTools([]);
                setCruState("speaking");
                setMessages((prev) => [
                  ...prev,
                  {
                    id: newMsgId,
                    role: "assistant",
                    content: fullContent,
                    wineCards: pendingWineCards.length > 0 ? pendingWineCards : undefined,
                  },
                ]);
                assistantAdded = true;
                lastUpdateTimeRef.current = Date.now();
              } else {
                const now = Date.now();
                if (now - lastUpdateTimeRef.current >= 80) {
                  setMessages((prev) => {
                    const updated = [...prev];
                    updated[updated.length - 1] = {
                      ...updated[updated.length - 1],
                      content: fullContent,
                      wineCards: pendingWineCards.length > 0 ? pendingWineCards : updated[updated.length - 1].wineCards,
                    };
                    return updated;
                  });
                  lastUpdateTimeRef.current = now;
                }
              }
            }
          } catch {}
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption"] });
    } catch (error: any) {
      setShowTyping(false);
      setActiveTools([]);
      const isAbort = error?.name === "AbortError";
      if (!isAbort) {
        console.error("Chat error:", error?.message);
        setMessages((prev) => [
          ...prev,
          {
            id: generateUniqueId(),
            role: "assistant",
            content: "I had trouble connecting to the server. Please check your internet connection and try again.",
          },
        ]);
      }
    } finally {
      if (assistantAdded) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: fullContent,
            wineCards: pendingWineCards.length > 0 ? pendingWineCards : updated[updated.length - 1].wineCards,
          };
          return updated;
        });
      }
      streamingMessageIdRef.current = null;
      setStreamingMessageId(null);
      setHasStartedResponse(false);
      setIsStreaming(false);
      setShowTyping(false);
      setActiveTools([]);
      setCruState("idle");
    }
  };

  const toolDisplayNames: Record<string, string> = {
    search_wines: "Searching cellar",
    get_wine_details: "Looking up wine",
    add_wine: "Adding wine",
    add_bottles: "Adding bottles",
    update_wine: "Updating wine",
    update_bottle: "Updating bottle",
    consume_bottle: "Recording consumption",
    get_cellar_stats: "Checking stats",
    get_recommendations: "Finding recommendations",
    get_weather: "Checking weather",
    get_consumption_history: "Checking history",
    get_storage_locations: "Checking storage",
    undo_consumption: "Undoing consumption",
    save_memory: "Noting that",
    delete_memory: "Updating notes",
  };

  const colorDot: Record<string, string> = {
    Red: Colors.light.colorRed,
    White: Colors.light.colorWhite,
    Rosé: Colors.light.colorRose,
    Sparkling: Colors.light.colorSparkling,
    Dessert: Colors.light.colorDessert,
    Fortified: Colors.light.colorFortified,
  };

  const renderWineCards = (cards: WineCard[]) => (
    <View style={styles.wineCardsContainer}>
      {cards.map((wine) => (
        <Pressable
          key={wine.id}
          style={styles.wineCardInline}
          onPress={() => router.push(`/wine/${wine.id}`)}
        >
          <View style={styles.wineCardHeader}>
            {wine.color && (
              <View style={[styles.wineCardDot, { backgroundColor: colorDot[wine.color] || CruColors.accent }]} />
            )}
            <Text style={styles.wineCardName} numberOfLines={1}>{wine.wine_name}</Text>
          </View>
          <Text style={styles.wineCardDetail} numberOfLines={1}>
            {wine.producer}{wine.vintage ? ` · ${wine.vintage}` : ""}{wine.region ? ` · ${wine.region}` : ""}
          </Text>
          <View style={styles.wineCardFooter}>
            {wine.score != null && Number(wine.score) > 0 ? <Text style={styles.wineCardScore}>{Math.round(Number(wine.score))} pts</Text> : null}
            {wine.bottle_count ? <Text style={styles.wineCardBottles}>{wine.bottle_count} bottle{wine.bottle_count !== 1 ? "s" : ""}</Text> : null}
          </View>
        </Pressable>
      ))}
    </View>
  );

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View>
        <View
          style={[
            styles.bubbleRow,
            isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
          ]}
        >
          {!isUser && (
            <View style={styles.avatarGlass}>
              {streamingMessageIdRef.current === item.id
                ? <CruThinking size={32} />
                : <CruMark size="sm" state="idle" />
              }
            </View>
          )}
          {isUser ? (
            <View style={[styles.bubble, styles.bubbleUser]}>
              {item.imageUri && (
                <Image
                  source={{ uri: item.imageUri }}
                  style={styles.bubbleImage}
                  resizeMode="cover"
                />
              )}
              {!!item.content && (
                <Text
                  style={[
                    styles.bubbleText,
                    styles.bubbleTextUser,
                    item.imageUri ? styles.bubbleTextWithImage : null,
                  ]}
                  selectable
                >
                  {item.content}
                </Text>
              )}
            </View>
          ) : (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              {item.imageUri && (
                <Image
                  source={{ uri: item.imageUri }}
                  style={styles.bubbleImage}
                  resizeMode="cover"
                />
              )}
              {!!item.content && (
                streamingMessageIdRef.current === item.id ? (
                  <Text style={styles.streamingText}>{item.content}</Text>
                ) : (
                  <Markdown style={markdownStyles}>{item.content}</Markdown>
                )
              )}
            </View>
          )}
        </View>
        {!isUser && item.wineCards && item.wineCards.length > 0 && renderWineCards(item.wineCards)}
      </View>
    );
  }, []);

  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showTyping) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => {
      pulse.stop();
      pulseAnim.setValue(0);
    };
  }, [showTyping]);

  const monologueNames: Record<string, string> = {
    search_wines: "scanning your cellar...",
    get_wine_details: "looking up that wine...",
    add_wine: "adding to cellar...",
    add_bottles: "logging bottles...",
    update_wine: "updating that...",
    update_bottle: "updating bottle...",
    consume_bottle: "recording that...",
    get_cellar_stats: "running the numbers...",
    get_recommendations: "picking some options...",
    get_weather: "checking the weather...",
    get_consumption_history: "looking back...",
    get_storage_locations: "checking storage...",
    undo_consumption: "undoing that...",
    save_memory: "making a note...",
    delete_memory: "noted...",
  };

  const renderTypingIndicator = () => {
    if (!showTyping || hasStartedResponse) return null;

    const thoughtText = activeTools.length > 0
      ? (monologueNames[activeTools[activeTools.length - 1]] || activeTools[activeTools.length - 1] + "...")
      : null;

    return (
      <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
        <View style={styles.avatarGlass}>
          <CruThinking size={32} />
        </View>
        {thoughtText && (
          <Animated.Text
            style={[
              styles.thinkingMonologue,
              {
                opacity: pulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 0.65],
                }),
              },
            ]}
          >
            {thoughtText}
          </Animated.Text>
        )}
      </View>
    );
  };

  const SUGGESTED_PROMPTS = [
    "What should I drink tonight?",
    "Show me my best reds",
    "What's approaching its peak?",
    "Recommend a wine for dinner",
    "Is this wine well priced?",
  ];

  const renderHomeState = () => {
    const fadeOpacity = homeLoading ? 0.4 : 1;

    // Build insight cards
    type InsightCard = {
      topLabel: string;
      mainText: string;
      subtitle: string;
      accentColor: string;
      onPress: () => void;
    };

    const insightCards: InsightCard[] = [];

    if (homeData?.alerts?.past_peak > 0) {
      insightCards.push({
        topLabel: "DRINK SOON",
        mainText: `${homeData.alerts.past_peak} past peak`,
        subtitle: "Open before it's too late",
        accentColor: "#DC2626",
        onPress: () => {
          router.push({ pathname: "/(tabs)", params: { drinkWindow: "past_peak" } });
        },
      });
    }

    if (homeData?.alerts?.approaching_peak > 0) {
      insightCards.push({
        topLabel: "PLAN AHEAD",
        mainText: `${homeData.alerts.approaching_peak} approaching`,
        subtitle: "Opening their window soon",
        accentColor: "#D97706",
        onPress: () => {
          router.push({ pathname: "/(tabs)", params: { drinkWindow: "approaching" } });
        },
      });
    }

    // Card 3: rotating state
    if (homeData?.unrated_count > 0) {
      insightCards.push({
        topLabel: "RATE & REVIEW",
        mainText: `${homeData.unrated_count} unrated`,
        subtitle: "Bottles awaiting your notes",
        accentColor: "#722F37",
        onPress: () => {
          router.push({ pathname: "/(tabs)/history", params: { rated: "false" } });
        },
      });
    } else {
      insightCards.push({
        topLabel: "ADD TO CELLAR",
        mainText: "Scan a label",
        subtitle: "Identify any wine instantly",
        accentColor: "rgba(114,47,55,0.35)",
        onPress: () => {
          router.push("/(tabs)/add");
        },
      });
    }

    // Ensure exactly 3 cards — fill from defaults if needed
    if (insightCards.length < 3) {
      const defaults: InsightCard[] = [
        {
          topLabel: "ADD TO CELLAR",
          mainText: "Scan a label",
          subtitle: "Identify any wine instantly",
          accentColor: "rgba(114,47,55,0.35)",
          onPress: () => router.push("/(tabs)/add"),
        },
      ];
      for (const d of defaults) {
        if (insightCards.length >= 3) break;
        if (!insightCards.some((c) => c.topLabel === d.topLabel)) {
          insightCards.push(d);
        }
      }
    }

    return (
      <View style={styles.homeContainer}>
        {/* Tonight's Pick — hero card */}
        <Animated.View style={{ opacity: fadeOpacity }}>
          {homeData?.tonight_pick ? (
            <Pressable
              style={styles.pickCardOuter}
              onPress={() => router.push({ pathname: "/wine/[id]", params: { id: homeData.tonight_pick.wine_id } })}
            >
              <BlurView intensity={50} tint="light" style={styles.pickBlur}>
                <View style={styles.pickCardInner}>
                  <Text style={styles.pickLabel}>TONIGHT'S PICK</Text>
                  <Text style={styles.pickWineName} numberOfLines={1}>
                    {homeData.tonight_pick.wine_name}
                  </Text>
                  <Text style={styles.pickDetail} numberOfLines={1}>
                    {homeData.tonight_pick.producer}
                    {homeData.tonight_pick.vintage ? ` · ${homeData.tonight_pick.vintage}` : ""}
                    {homeData.tonight_pick.region ? ` · ${homeData.tonight_pick.region}` : ""}
                  </Text>
                  {homeData.tonight_pick.reason && (
                    <View style={styles.pickReasonTag}>
                      <Text style={styles.pickReasonText}>{homeData.tonight_pick.reason}</Text>
                    </View>
                  )}
                </View>
              </BlurView>
            </Pressable>
          ) : (
            <View style={[styles.pickCardOuter, { height: 120 }]} />
          )}
        </Animated.View>

        {/* Three insight cards */}
        <Animated.View style={[styles.tilesRow, { opacity: fadeOpacity }]}>
          {insightCards.slice(0, 3).map((card) => (
            <Pressable
              key={card.topLabel}
              style={styles.insightCardOuter}
              onPress={card.onPress}
            >
              <BlurView intensity={40} tint="light" style={styles.insightBlur}>
                <View style={[styles.insightAccent, { backgroundColor: card.accentColor }]} />
                <View style={styles.insightCardInner}>
                  <Text style={styles.insightTopLabel}>{card.topLabel}</Text>
                  <Text style={styles.insightMainText} numberOfLines={1}>{card.mainText}</Text>
                  <Text style={styles.insightSubtitle} numberOfLines={1}>{card.subtitle}</Text>
                </View>
              </BlurView>
            </Pressable>
          ))}
        </Animated.View>

        {/* Suggested prompts — split into balanced rows */}
        <View style={styles.promptsContainer}>
          {(() => {
            const mid = Math.ceil(SUGGESTED_PROMPTS.length / 2);
            const rows = [SUGGESTED_PROMPTS.slice(0, mid), SUGGESTED_PROMPTS.slice(mid)];
            return rows.map((row, ri) => (
              <View key={ri} style={styles.promptsRow}>
                {row.map((prompt) => (
                  <Pressable
                    key={prompt}
                    style={styles.promptChip}
                    onPress={() => handleSend(prompt)}
                  >
                    <Text style={styles.promptChipText} numberOfLines={1}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            ));
          })()}
        </View>
      </View>
    );
  };

  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const tabBarHeight = isWeb ? 84 : 68;

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : 0, paddingBottom: tabBarHeight }]}>
      <CruMeshBackground />
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS !== "web" ? insets.top + 8 : 8 },
        ]}
      >
        <Text style={styles.headerTitle}>Cru</Text>
        {messages.length > 0 && (
          <Pressable
            onPress={() => {
              setMessages([]);
              setActiveTools([]);
              fetchHomeData();
            }}
            hitSlop={8}
          >
            <Ionicons
              name="refresh"
              size={20}
              color="rgba(26,10,12,0.4)"
            />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <Pressable style={styles.flex} onPress={Keyboard.dismiss} accessible={false}>
          {messages.length === 0 ? (
            renderHomeState()
          ) : (
            <FlatList
              data={reversedMessages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              inverted={messages.length > 0}
              ListHeaderComponent={renderTypingIndicator}
              contentContainerStyle={styles.messageList}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              scrollEnabled={messages.length > 0}
              removeClippedSubviews={Platform.OS !== "web"}
              maxToRenderPerBatch={5}
              windowSize={5}
              initialNumToRender={8}
              updateCellsBatchingPeriod={50}
            />
          )}
        </Pressable>

        <BlurView intensity={40} tint="light" style={styles.inputBlur}>
          <View
            style={[
              styles.inputContainer,
              {
                paddingBottom: 8,
              },
            ]}
          >
          {pendingImage && (
            <View style={styles.imagePreviewContainer}>
              <Image
                source={{ uri: pendingImage.uri }}
                style={styles.imagePreview}
                resizeMode="cover"
              />
              <Pressable
                onPress={() => setPendingImage(null)}
                style={styles.removeImageButton}
                testID="remove-image"
              >
                <Ionicons name="close-circle" size={22} color={CruColors.textPrimary} />
              </Pressable>
            </View>
          )}
          <View style={styles.inputRow}>
            <Pressable
              onPress={() => pickImage(true)}
              disabled={isStreaming}
              style={styles.mediaButton}
              testID="camera-button"
            >
              <Ionicons
                name="camera-outline"
                size={24}
                color={isStreaming ? CruColors.accentMuted : "rgba(114,47,55,0.6)"}
              />
            </Pressable>
            <Pressable
              onPress={() => pickImage(false)}
              disabled={isStreaming}
              style={styles.mediaButton}
              testID="gallery-button"
            >
              <Ionicons
                name="image-outline"
                size={24}
                color={isStreaming ? CruColors.accentMuted : "rgba(114,47,55,0.6)"}
              />
            </Pressable>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="Ask Cru anything..."
              placeholderTextColor="rgba(114,47,55,0.4)"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
              multiline
              maxLength={2000}
              editable={!isStreaming}
              testID="chat-input"
            />
            <Pressable
              onPress={() => {
                handleSend();
                inputRef.current?.focus();
              }}
              disabled={(!inputText.trim() && !pendingImage) || isStreaming}
              style={[
                styles.sendButton,
                (inputText.trim() || pendingImage) && !isStreaming
                  ? styles.sendButtonActive
                  : styles.sendButtonDisabled,
              ]}
              testID="send-button"
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={
                  (inputText.trim() || pendingImage) && !isStreaming
                    ? "#FFFFFF"
                    : "rgba(114,47,55,0.4)"
                }
              />
            </Pressable>
          </View>
        </View>
        </BlurView>
      </KeyboardAvoidingView>
      {undoToast ? (
        <Animated.View style={[styles.undoToast, { opacity: undoFadeAnim }]}>
          <Ionicons name="wine-outline" size={18} color="#FFFFFF" />
          <Text style={styles.undoToastText} numberOfLines={2}>
            {undoToast.message}
          </Text>
          <Pressable onPress={handleUndo} style={styles.undoButton}>
            <Text style={styles.undoButtonText}>Undo</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const markdownStyles = {
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Outfit_400Regular",
    color: CruColors.textPrimary,
  },
  text: {
    fontFamily: "Outfit_400Regular",
  },
  strong: {
    fontFamily: "Outfit_600SemiBold",
  },
  em: {
    fontFamily: "Outfit_400Regular",
    fontStyle: "italic" as const,
  },
  heading1: {
    fontSize: 20,
    fontFamily: "LibreBaskerville_700Bold",
    color: CruColors.textPrimary,
    marginTop: 8,
    marginBottom: 4,
  },
  heading2: {
    fontSize: 18,
    fontFamily: "LibreBaskerville_700Bold",
    color: CruColors.textPrimary,
    marginTop: 6,
    marginBottom: 4,
  },
  heading3: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: CruColors.textPrimary,
    marginTop: 4,
    marginBottom: 2,
  },
  bullet_list: {
    marginTop: 4,
    marginBottom: 4,
  },
  ordered_list: {
    marginTop: 4,
    marginBottom: 4,
  },
  list_item: {
    marginTop: 2,
    marginBottom: 2,
  },
  bullet_list_content: {
    fontFamily: "Outfit_400Regular",
  },
  ordered_list_content: {
    fontFamily: "Outfit_400Regular",
  },
  textgroup: {
    fontFamily: "Outfit_400Regular",
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 6,
  },
  link: {
    color: CruColors.accent,
    textDecorationLine: "underline" as const,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FDF6F0",
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "transparent",
  },
  headerTitle: {
    fontSize: 34,
    fontFamily: "LibreBaskerville_700Bold",
    color: "#1A0A0C",
  },
  messageList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bubbleRow: {
    flexDirection: "row" as const,
    marginVertical: 4,
    maxWidth: "85%" as const,
  },
  bubbleRowUser: {
    alignSelf: "flex-end" as const,
  },
  bubbleRowAssistant: {
    alignSelf: "flex-start" as const,
  },
  avatarGlass: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: 8,
    marginTop: 4,
    overflow: "hidden" as const,
  },
  avatarImage: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "100%" as const,
    flexShrink: 1,
    overflow: "hidden" as const,
  },
  bubbleUser: {
    backgroundColor: CruColors.accent,
    borderBottomRightRadius: 4,
    shadowColor: CruColors.warmShadow,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bubbleAssistant: {
    backgroundColor: CruColors.glassBg,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: CruColors.glassBorder,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Outfit_400Regular",
  },
  bubbleTextUser: {
    color: "#FFFFFF",
  },
  thinkingMonologue: {
    fontSize: 13,
    fontFamily: "Outfit_400Regular",
    fontStyle: "italic" as const,
    color: CruColors.textSecondary,
    alignSelf: "center" as const,
    marginLeft: 4,
    flexShrink: 1,
  },
  streamingText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Outfit_400Regular",
    color: CruColors.textPrimary,
  },
  inputBlur: {
    overflow: "hidden" as const,
  },
  inputContainer: {
    backgroundColor: "transparent",
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  inputRow: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(114,47,55,0.15)",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: CruColors.textPrimary,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 2,
  },
  sendButtonActive: {
    backgroundColor: CruColors.accent,
  },
  sendButtonDisabled: {
    backgroundColor: CruColors.accentMuted,
  },
  mediaButton: {
    width: 36,
    height: 36,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 2,
  },
  imagePreviewContainer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  imagePreview: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  removeImageButton: {
    marginLeft: 8,
  },
  bubbleImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
  },
  bubbleTextWithImage: {
    marginTop: 6,
  },
  homeContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  // Tonight's Pick — hero card
  pickCardOuter: {
    borderRadius: 18,
    overflow: "hidden" as const,
    marginBottom: 16,
    shadowColor: "#2D1215",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pickBlur: {
    borderRadius: 18,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.95)",
  },
  pickCardInner: {
    backgroundColor: "rgba(255,255,255,0.82)",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  pickLabel: {
    fontFamily: "Outfit_600SemiBold",
    fontSize: 12,
    letterSpacing: 0.5,
    color: "rgba(114,47,55,0.65)",
  },
  pickWineName: {
    fontFamily: "LibreBaskerville_400Regular",
    fontSize: 22,
    color: "#1A0A0C",
    marginTop: 4,
    marginBottom: 4,
  },
  pickDetail: {
    fontFamily: "Outfit_400Regular",
    fontSize: 14,
    color: "rgba(45,18,21,0.60)",
  },
  pickReasonTag: {
    backgroundColor: "rgba(114,47,55,0.10)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(114,47,55,0.22)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 8,
    alignSelf: "flex-start" as const,
  },
  pickReasonText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    color: "rgba(114,47,55,0.85)",
  },
  // Three insight cards
  tilesRow: {
    flexDirection: "row" as const,
    gap: 10,
    marginBottom: 20,
  },
  insightCardOuter: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden" as const,
    shadowColor: "#2D1215",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    height: 90,
  },
  insightBlur: {
    flex: 1,
    borderRadius: 14,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.90)",
  },
  insightAccent: {
    position: "absolute" as const,
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
  },
  insightCardInner: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.75)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center" as const,
  },
  insightTopLabel: {
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    color: "rgba(114,47,55,0.55)",
  },
  insightMainText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    color: "#1A0A0C",
    marginTop: 2,
  },
  insightSubtitle: {
    fontFamily: "Outfit_400Regular",
    fontSize: 13,
    color: "rgba(45,18,21,0.55)",
    marginTop: 1,
  },
  // Suggested prompt chips
  promptsContainer: {
    marginTop: 0,
    gap: 8,
  },
  promptsRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  promptChip: {
    flex: 1,
    alignItems: "center" as const,
    backgroundColor: "rgba(255,255,255,0.70)",
    borderWidth: 1,
    borderColor: "rgba(114,47,55,0.25)",
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#2D1215",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  promptChipText: {
    fontFamily: "Outfit_500Medium",
    fontSize: 14,
    color: "#722F37",
  },
  wineCardsContainer: {
    paddingLeft: 48,
    paddingRight: 16,
    marginTop: 4,
    marginBottom: 4,
    gap: 6,
  },
  wineCardInline: {
    backgroundColor: CruColors.glassBg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: CruColors.glassBorder,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  wineCardHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  wineCardDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  wineCardName: {
    ...theme.typography.heading3,
    color: CruColors.textPrimary,
    flex: 1,
  },
  wineCardDetail: {
    ...theme.typography.caption,
    color: CruColors.textSecondary,
    marginTop: 2,
    marginLeft: 14,
  },
  wineCardFooter: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 4,
    marginLeft: 14,
  },
  wineCardScore: {
    ...theme.typography.caption,
    color: CruColors.accent,
    fontFamily: "Outfit_600SemiBold",
  },
  wineCardBottles: {
    ...theme.typography.caption,
    color: CruColors.textSecondary,
  },
  undoToast: {
    position: "absolute" as const,
    bottom: 100,
    left: 16,
    right: 16,
    backgroundColor: CruColors.gradientTop,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    shadowColor: CruColors.warmShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  undoToastText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Outfit_400Regular",
    color: "#FFFFFF",
  },
  undoButton: {
    backgroundColor: CruColors.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
  },
  undoButtonText: {
    fontSize: 14,
    fontFamily: "Outfit_600SemiBold",
    color: "#FFFFFF",
  },
});
