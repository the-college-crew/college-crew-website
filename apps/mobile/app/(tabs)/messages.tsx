import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Button, Card, EmptyState, ErrorNote } from "@/components/ui";
import { useSession } from "@/lib/session";
import { fetchConversations } from "@/lib/messages";
import { formatMessageTime } from "@/lib/format";
import { color, space, type } from "@/lib/theme";

export default function Messages() {
  const { session } = useSession();

  const convos = useQuery({
    queryKey: ["conversations", session?.user.id],
    enabled: !!session,
    queryFn: () => fetchConversations(session!.user.id),
  });

  if (!session) {
    return (
      <EmptyState
        title="Chat after you book"
        body="Log in to message your provider once a booking is underway."
        action={<Button title="Log in" onPress={() => router.push("/(auth)/login")} />}
      />
    );
  }

  if (convos.isLoading) {
    return <ActivityIndicator color={color.viridian} style={{ marginTop: space.xxl }} />;
  }
  if (convos.isError) {
    return <ErrorNote message="Could not load conversations. Pull to retry." />;
  }
  if ((convos.data ?? []).length === 0) {
    return (
      <EmptyState
        title="No conversations yet"
        body="Message a provider from their profile, or a thread opens automatically when a booking starts."
      />
    );
  }

  return (
    <FlatList
      contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: space.xxl }}
      data={convos.data}
      keyExtractor={(c) => c.id}
      refreshing={convos.isRefetching}
      onRefresh={() => convos.refetch()}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/messages/${item.id}`)}
          style={({ pressed }) => pressed && { opacity: 0.9 }}
        >
          <Card>
            <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
              <Avatar name={item.counterpartyName} size={44} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ ...type.headline, color: color.ink, flexShrink: 1 }} numberOfLines={1}>
                    {item.counterpartyName}
                  </Text>
                  <Text style={{ ...type.footnote, color: color.mist }}>
                    {formatMessageTime(item.lastAt)}
                  </Text>
                </View>
                {item.bookingLabel ? (
                  <Text style={{ ...type.footnote, color: color.viridian }} numberOfLines={1}>
                    {item.bookingLabel}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Text
                    style={{
                      ...type.subhead,
                      color: item.unread > 0 ? color.ink : color.inkSoft,
                      fontWeight: item.unread > 0 ? "600" : "400",
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {item.preview}
                  </Text>
                  {item.unread > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{item.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </Card>
        </Pressable>
      )}
    />
  );
}

const styles = {
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.viridian,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 6,
  },
  badgeText: { color: color.onViridian, fontSize: 12, fontWeight: "700" as const },
};
