import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { Link } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { color, radius, space, type } from "@/lib/theme";

type Service = { id: string; name: string };

/**
 * Home: proves the anon read path end to end. The curated service list comes
 * from the services table (admin-toggled), never hard-coded.
 */
export default function Home() {
  const { session, role } = useSession();

  const services = useQuery({
    queryKey: ["services"],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <FlatList
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      data={services.data ?? []}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={
        <View style={{ gap: space.sm, marginBottom: space.md }}>
          <Text style={{ ...type.title1, color: color.ink }}>
            {session ? "Good to see you." : "Neighborhood help, one tap away."}
          </Text>
          <Text style={{ ...type.subhead, color: color.inkSoft }}>
            Verified student providers for everyday services, right nearby.
          </Text>
          {role === "admin" ? (
            <Text style={{ ...type.footnote, color: color.inkSoft }}>
              Admin tools live on the website. This app is the customer and provider experience.
            </Text>
          ) : null}
          {!session ? (
            <Link
              href="/(auth)/signup"
              style={{ ...type.headline, color: color.viridian, marginTop: space.sm }}
            >
              Create an account to book
            </Link>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <View
          style={{
            backgroundColor: color.card,
            borderColor: color.line,
            borderWidth: 1,
            borderRadius: radius.card,
            padding: space.md,
          }}
        >
          <Text style={{ ...type.headline, color: color.ink }}>{item.name}</Text>
        </View>
      )}
      ListEmptyComponent={
        services.isLoading ? (
          <ActivityIndicator color={color.viridian} style={{ marginTop: space.xl }} />
        ) : services.isError ? (
          <Text style={{ ...type.subhead, color: color.inkSoft, textAlign: "center" }}>
            Could not load services. Pull to retry.
          </Text>
        ) : (
          <Text style={{ ...type.subhead, color: color.inkSoft, textAlign: "center" }}>
            No services are live yet. Check back soon.
          </Text>
        )
      }
      refreshing={services.isRefetching}
      onRefresh={() => services.refetch()}
    />
  );
}
