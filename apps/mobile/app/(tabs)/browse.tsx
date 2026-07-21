import { useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Chip, ErrorNote } from "@/components/ui";
import { ProviderCardView } from "@/components/provider-card";
import {
  fetchProviders,
  fetchServiceFilters,
  type ProviderSort,
} from "@/lib/queries";
import { color, space, type } from "@/lib/theme";

const SORTS: { key: ProviderSort; label: string }[] = [
  { key: "suggested", label: "Suggested" },
  { key: "rating", label: "Rating" },
  { key: "rate", label: "Hourly rate" },
];

export default function Browse() {
  const [slug, setSlug] = useState<string | null>(null);
  const [sort, setSort] = useState<ProviderSort>("suggested");

  const filters = useQuery({ queryKey: ["service-filters"], queryFn: fetchServiceFilters });
  const providers = useQuery({
    queryKey: ["providers", slug, sort],
    queryFn: () => fetchProviders({ serviceSlug: slug, sort }),
  });

  return (
    <FlatList
      contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
      data={providers.data ?? []}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <View style={{ gap: space.md, marginBottom: space.xs }}>
          <View style={{ gap: space.xs }}>
            <Text style={{ ...type.title1, color: color.ink }}>Browse the crew</Text>
            <Text style={{ ...type.subhead, color: color.inkSoft, lineHeight: 20 }}>
              Verified student providers in your neighborhood. Only ID-approved students are listed.
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm, paddingVertical: 2 }}
          >
            <Chip
              label="All services"
              selected={slug === null}
              count={filters.data?.reduce((n, f) => n + f.count, 0)}
              onPress={() => setSlug(null)}
            />
            {(filters.data ?? []).map((f) => (
              <Chip
                key={f.id}
                label={f.name}
                count={f.count}
                selected={slug === f.slug}
                onPress={() => setSlug(f.slug)}
              />
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm }}
          >
            {SORTS.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                selected={sort === s.key}
                onPress={() => setSort(s.key)}
              />
            ))}
          </ScrollView>
        </View>
      }
      renderItem={({ item }) => (
        <ProviderCardView provider={item} onPress={() => router.push(`/provider/${item.id}`)} />
      )}
      ListEmptyComponent={
        providers.isLoading ? (
          <ActivityIndicator color={color.viridian} style={{ marginTop: space.xl }} />
        ) : providers.isError ? (
          <ErrorNote message="Could not load providers. Pull to retry." />
        ) : (
          <ErrorNote
            message={
              slug
                ? "No providers offer this service yet. Try another service."
                : "No providers are listed yet. Check back soon."
            }
          />
        )
      }
      refreshing={providers.isRefetching}
      onRefresh={() => providers.refetch()}
    />
  );
}
