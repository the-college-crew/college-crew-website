import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Center, ErrorNote } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import {
  fetchMessages,
  markConversationRead,
  sendMessage,
  type ChatMessage,
} from "@/lib/messages";
import { formatMessageTime } from "@/lib/format";
import { color, radius, space, type } from "@/lib/theme";

export default function ChatThread() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { session } = useSession();
  const insets = useSafeAreaInsets();
  const me = session?.user.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [title, setTitle] = useState("Chat");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchMessages(conversationId);
      setMessages(rows);
      setStatus("ready");
      if (me) void markConversationRead(conversationId, me);
    } catch {
      setStatus("error");
    }
  }, [conversationId, me]);

  // Header: resolve the counterparty's name.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("conversations")
        .select(
          `customer_id,
           provider:provider_profiles(display_name),
           customer:profiles!conversations_customer_id_fkey(full_name)`,
        )
        .eq("id", conversationId)
        .maybeSingle();
      if (!data) return;
      const amCustomer = (data.customer_id as string) === me;
      const provider = Array.isArray(data.provider) ? data.provider[0] : data.provider;
      const customer = Array.isArray(data.customer) ? data.customer[0] : data.customer;
      setTitle(
        amCustomer
          ? (provider?.display_name as string) || "Provider"
          : (customer?.full_name as string) || "Customer",
      );
    })();
  }, [conversationId, me]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: the JWT must be on the socket before subscribing or no rows arrive.
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const token = session?.access_token;
      if (token) await supabase.realtime.setAuth(token);
      channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const row = payload.new as ChatMessage;
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
            if (row.sender_id !== me && me) void markConversationRead(conversationId, me);
          },
        )
        .subscribe();
    })();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [conversationId, me, session?.access_token]);

  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  async function onSend() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    const err = await sendMessage(conversationId, body);
    setSending(false);
    if (err) {
      setDraft(body); // restore so the user doesn't lose their text
      return;
    }
    void load(); // realtime also delivers it; this guarantees it appears
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title, headerBackTitle: "Back" }} />
      {status === "loading" ? (
        <Center>
          <ActivityIndicator color={color.viridian} />
        </Center>
      ) : status === "error" ? (
        <Center>
          <ErrorNote message="Could not load this conversation." />
        </Center>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: color.cream }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={96}
        >
          <FlatList
            data={reversed}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerStyle={{ padding: space.lg, gap: space.sm }}
            ListEmptyComponent={
              <Text style={{ ...type.subhead, color: color.mist, textAlign: "center", marginTop: space.xl }}>
                Say hello. Keep contact details in the app until you&apos;ve booked.
              </Text>
            }
            renderItem={({ item }) => <Bubble message={item} mine={item.sender_id === me} />}
          />
          <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={color.mist}
              style={styles.input}
              multiline
            />
            <Pressable
              onPress={onSend}
              disabled={!draft.trim() || sending}
              style={[styles.send, (!draft.trim() || sending) && { opacity: 0.4 }]}
            >
              {sending ? (
                <ActivityIndicator color={color.onViridian} />
              ) : (
                <Text style={{ color: color.onViridian, fontWeight: "700" }}>Send</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </>
  );
}

function Bubble({ message, mine }: { message: ChatMessage; mine: boolean }) {
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: color.viridian, borderBottomRightRadius: 4 }
            : { backgroundColor: color.paper, borderColor: color.line, borderWidth: 1, borderBottomLeftRadius: 4 },
        ]}
      >
        {message.body ? (
          <Text style={{ ...type.body, color: mine ? color.onViridian : color.ink }}>
            {message.body}
          </Text>
        ) : message.image_path ? (
          <Text style={{ ...type.body, color: mine ? color.onViridian : color.inkSoft }}>📷 Photo</Text>
        ) : null}
      </View>
      <Text style={{ ...type.footnote, color: color.mist, marginTop: 2, marginHorizontal: 4 }}>
        {formatMessageTime(message.created_at)}
      </Text>
    </View>
  );
}

const styles = {
  bubble: {
    maxWidth: "82%" as const,
    borderRadius: radius.card,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  inputBar: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: color.line,
    backgroundColor: color.paper,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.card,
    backgroundColor: color.cream,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    fontSize: type.body.fontSize,
    color: color.ink,
  },
  send: {
    height: 44,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.viridian,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
