import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Linking,
  Image,
  Alert,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetch } from "expo/fetch";
import Markdown from "react-native-markdown-display";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import Colors from "@/constants/colors";
import { getApiUrl, queryClient } from "@/lib/query-client";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUri?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

let messageCounter = 0;
function generateUniqueId(): string {
  messageCounter++;
  return `msg-${Date.now()}-${messageCounter}-${Math.random().toString(36).substr(2, 9)}`;
}

export default function SommelierScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);
  const abortRef = useRef<AbortController | null>(null);
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

  const handleSend = async () => {
    const text = inputText.trim();
    const image = pendingImage;
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

    setInputText("");
    setPendingImage(null);
    setMessages((prev) => [...prev, userMessage]);
    setIsStreaming(true);
    setShowTyping(true);
    setActiveTools([]);

    let fullContent = "";
    let assistantAdded = false;

    try {
      const baseUrl = getApiUrl();

      const chatHistory = currentMessages.map((m) => {
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

      const response = await fetch(new URL("/api/chat", baseUrl).toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          messages: chatHistory,
          location: userLocation || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Failed to get response");

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

            if (parsed.error) {
              fullContent += parsed.error;
            }

            if (parsed.content) {
              fullContent += parsed.content;

              if (!assistantAdded) {
                setShowTyping(false);
                setActiveTools([]);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateUniqueId(),
                    role: "assistant",
                    content: fullContent,
                  },
                ]);
                assistantAdded = true;
              } else {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: fullContent,
                  };
                  return updated;
                });
              }
            }
          } catch {}
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/consumption"] });
    } catch (error) {
      setShowTyping(false);
      setActiveTools([]);
      setMessages((prev) => [
        ...prev,
        {
          id: generateUniqueId(),
          role: "assistant",
          content: "I had trouble connecting. Please try again.",
        },
      ]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
      setActiveTools([]);
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
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View
        style={[
          styles.bubbleRow,
          isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant,
        ]}
      >
        {!isUser && (
          <View style={styles.avatarContainer}>
            <Ionicons name="wine" size={16} color={Colors.light.white} />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
          ]}
        >
          {item.imageUri && (
            <Image
              source={{ uri: item.imageUri }}
              style={styles.bubbleImage}
              resizeMode="cover"
            />
          )}
          {!!item.content && (
            isUser ? (
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
            ) : (
              <Markdown style={markdownStyles}>
                {item.content}
              </Markdown>
            )
          )}
        </View>
      </View>
    );
  };

  const renderTypingIndicator = () => {
    if (!showTyping) return null;
    return (
      <View style={[styles.bubbleRow, styles.bubbleRowAssistant]}>
        <View style={styles.avatarContainer}>
          <Ionicons name="wine" size={16} color={Colors.light.white} />
        </View>
        <View style={[styles.bubble, styles.bubbleAssistant]}>
          {activeTools.length > 0 ? (
            <View style={styles.toolIndicator}>
              <ActivityIndicator size="small" color={Colors.light.tint} />
              <Text style={styles.toolText}>
                {toolDisplayNames[activeTools[activeTools.length - 1]] ||
                  activeTools[activeTools.length - 1]}
                ...
              </Text>
            </View>
          ) : (
            <View style={styles.typingDots}>
              <View style={[styles.dot, styles.dot1]} />
              <View style={[styles.dot, styles.dot2]} />
              <View style={[styles.dot, styles.dot3]} />
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="wine" size={48} color={Colors.light.tint} />
      </View>
      <Text style={styles.emptyTitle}>Your Personal Sommelier</Text>
      <Text style={styles.emptySubtitle}>
        Ask me about your cellar, get recommendations, track what you drink, or
        add new wines.
      </Text>
      <View style={styles.suggestionsContainer}>
        {[
          "What should I drink tonight?",
          "Show me my best reds",
          "What's in my cellar?",
          "Any wines past their peak?",
        ].map((suggestion) => (
          <Pressable
            key={suggestion}
            style={styles.suggestionChip}
            onPress={() => {
              setInputText(suggestion);
              setTimeout(() => inputRef.current?.focus(), 100);
            }}
          >
            <Text style={styles.suggestionText}>{suggestion}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const reversedMessages = [...messages].reverse();

  const tabBarHeight = isWeb ? 84 : Platform.OS === "ios" ? 49 + insets.bottom : 56;

  return (
    <View style={[styles.container, { paddingTop: isWeb ? 67 : 0, paddingBottom: tabBarHeight }]}>
      <View
        style={[
          styles.header,
          { paddingTop: Platform.OS !== "web" ? insets.top + 8 : 8 },
        ]}
      >
        <Text style={styles.headerTitle}>Sommelier</Text>
        {messages.length > 0 && (
          <Pressable
            onPress={() => {
              setMessages([]);
              setActiveTools([]);
            }}
            hitSlop={8}
          >
            <Ionicons
              name="refresh"
              size={20}
              color={Colors.light.textSecondary}
            />
          </Pressable>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          renderEmptyState()
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
          />
        )}

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
                <Ionicons name="close-circle" size={22} color={Colors.light.text} />
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
                color={isStreaming ? Colors.light.tabIconDefault : Colors.light.tint}
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
                color={isStreaming ? Colors.light.tabIconDefault : Colors.light.tint}
              />
            </Pressable>
            <TextInput
              ref={inputRef}
              style={styles.textInput}
              placeholder="Ask your sommelier..."
              placeholderTextColor={Colors.light.tabIconDefault}
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
                    ? Colors.light.white
                    : Colors.light.tabIconDefault
                }
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const markdownStyles = {
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
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
    color: Colors.light.text,
    marginTop: 8,
    marginBottom: 4,
  },
  heading2: {
    fontSize: 18,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
    marginTop: 6,
    marginBottom: 4,
  },
  heading3: {
    fontSize: 16,
    fontFamily: "Outfit_600SemiBold",
    color: Colors.light.text,
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
    color: Colors.light.tint,
    textDecorationLine: "underline" as const,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.border,
    backgroundColor: Colors.light.background,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "LibreBaskerville_700Bold",
    color: Colors.light.text,
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
  avatarContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.tint,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: 8,
    marginTop: 4,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: "100%" as const,
    flexShrink: 1,
  },
  bubbleUser: {
    backgroundColor: Colors.light.tint,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: Colors.light.cardBackground,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
    fontFamily: "Outfit_400Regular",
  },
  bubbleTextUser: {
    color: Colors.light.white,
  },
  toolIndicator: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  toolText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontFamily: "Outfit_500Medium",
    fontStyle: "italic" as const,
  },
  typingDots: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: Colors.light.tabIconDefault,
  },
  dot1: { opacity: 0.4 },
  dot2: { opacity: 0.6 },
  dot3: { opacity: 0.8 },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.border,
    backgroundColor: Colors.light.background,
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 10 : 8,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.text,
    backgroundColor: Colors.light.cardBackground,
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
    backgroundColor: Colors.light.tint,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.light.border,
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
  emptyContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F3E8E9",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: "Outfit_700Bold",
    color: Colors.light.text,
    marginBottom: 8,
    textAlign: "center" as const,
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: "Outfit_400Regular",
    color: Colors.light.textSecondary,
    textAlign: "center" as const,
    lineHeight: 22,
    marginBottom: 24,
  },
  suggestionsContainer: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    justifyContent: "center" as const,
    gap: 8,
  },
  suggestionChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.light.tint,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#F3E8E9",
  },
  suggestionText: {
    fontSize: 13,
    fontFamily: "Outfit_500Medium",
    color: Colors.light.tint,
  },
});
