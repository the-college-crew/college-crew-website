import { Pressable, Text, View } from "react-native";
import { Avatar, Badge, Banner, BillingNote, Card, Rating } from "@/components/ui";
import { color, space, type } from "@/lib/theme";
import { formatOfferedPrice } from "@/lib/format";
import type { ProviderCard as ProviderCardData } from "@/lib/queries";

/** Small gold check circle — the compact "verified student" mark from Browse. */
function VerifiedCheck() {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: color.gold,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: color.viridianDeep, fontSize: 11, fontWeight: "800" }}>✓</Text>
    </View>
  );
}

/**
 * Roster card used on Browse. Whole card taps through to the profile. Mirrors
 * the web ProviderCard: banner, overlapping avatar, identity row, bio, priced
 * service chips, billing footnote — retuned for a single phone column.
 */
export function ProviderCardView({
  provider,
  onPress,
}: {
  provider: ProviderCardData;
  onPress: () => void;
}) {
  const name = provider.company_name || provider.display_name;
  const shownServices = provider.services.slice(0, 4);
  const extra = provider.services.length - shownServices.length;
  const firstParagraph = provider.bio.split(/\n\s*\n/)[0] ?? "";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => pressed && { opacity: 0.9 }}
    >
      <Card padded={false}>
        <Banner height={84} />
        <View style={{ padding: space.md, gap: space.sm }}>
          <View style={{ marginTop: -44 }}>
            <Avatar name={name} size={56} onBanner />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Text style={{ ...type.title2, color: color.ink }}>{name}</Text>
            <VerifiedCheck />
          </View>
          <Rating avg={provider.rating?.avg ?? null} count={provider.rating?.count ?? null} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
            <Badge
              label={
                provider.provider_type === "business" ? "Student business" : "Individual"
              }
              tone={provider.provider_type === "business" ? "sky" : "stone"}
            />
            {provider.neighborhood ? (
              <Text style={{ ...type.footnote, color: color.inkSoft }}>{provider.neighborhood}</Text>
            ) : null}
          </View>

          {firstParagraph ? (
            <Text style={{ ...type.subhead, color: color.inkSoft, lineHeight: 20 }} numberOfLines={3}>
              {firstParagraph}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {shownServices.map((s) => (
              <View
                key={s.id}
                style={{
                  flexDirection: "row",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: color.line,
                  backgroundColor: color.cream,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ ...type.footnote, color: color.inkSoft }}>{s.service_name} </Text>
                <Text style={{ ...type.footnote, color: color.goldDeep, fontWeight: "700" }}>
                  {formatOfferedPrice(s)}
                </Text>
              </View>
            ))}
            {extra > 0 ? (
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  justifyContent: "center",
                }}
              >
                <Text style={{ ...type.footnote, color: color.mist }}>+{extra} more</Text>
              </View>
            ) : null}
          </View>

          <BillingNote />
        </View>
      </Card>
    </Pressable>
  );
}
