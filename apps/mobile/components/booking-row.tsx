import { Pressable, Text, View } from "react-native";
import { Card, StatusBadge } from "@/components/ui";
import { color, space, type } from "@/lib/theme";
import { formatDateTime } from "@/lib/format";
import type { Booking } from "@/lib/bookings";

/**
 * One booking, scannable. Used on the customer Bookings tab (counterparty =
 * provider) and the Provider dashboard (counterparty = customer). Tap opens the
 * detail screen where the status-specific actions live.
 */
export function BookingRow({
  booking,
  counterparty,
  onPress,
}: {
  booking: Booking;
  counterparty: "provider" | "customer";
  onPress: () => void;
}) {
  const who = counterparty === "provider" ? booking.provider_name : booking.customer_name;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.9 }}>
      <Card>
        <View style={{ gap: space.xs }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: space.sm,
            }}
          >
            <Text style={{ ...type.headline, color: color.ink, flexShrink: 1 }}>
              {booking.service_name}
            </Text>
            <StatusBadge status={booking.status} />
          </View>
          <Text style={{ ...type.subhead, color: color.inkSoft }}>
            {counterparty === "provider" ? "with " : "for "}
            {who}
          </Text>
          <Text style={{ ...type.subhead, color: color.ink }}>
            {formatDateTime(booking.scheduled_at)}
          </Text>
          {booking.address ? (
            <Text style={{ ...type.footnote, color: color.mist }} numberOfLines={1}>
              {booking.address}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}
