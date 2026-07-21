import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { color, radius, space, type } from "@/lib/theme";
import { initials } from "@/lib/format";
import { statusMeta, toneColors, type BookingStatus, type Tone } from "@/lib/status";

/* -------------------------------------------------------------------------- */
/* Buttons + inputs                                                           */
/* -------------------------------------------------------------------------- */

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  size = "md",
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  size?: "md" | "sm";
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        size === "sm" && styles.buttonSm,
        primary && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        pressed && { transform: [{ scale: 0.98 }] },
        (disabled || loading) && { opacity: 0.45 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? color.onViridian : color.viridian} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            size === "sm" && { fontSize: type.subhead.fontSize },
            { color: primary ? color.onViridian : color.viridian },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  hint,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.mist}
        style={[
          styles.input,
          input.multiline && { minHeight: 96, paddingTop: space.sm, textAlignVertical: "top" },
          error ? { borderColor: color.danger } : null,
        ]}
        {...input}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

/** Warm paper card — the single container primitive, matching the web card. */
export function Card({
  children,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && { padding: space.md }, style]}>{children}</View>;
}

/** The signature two-tone stripe (viridian / honeydew / sky) from the web. */
export function Pennant() {
  return (
    <View style={styles.pennant}>
      <View style={{ flex: 2, backgroundColor: color.viridian }} />
      <View style={{ flex: 1, backgroundColor: color.honeydew }} />
      <View style={{ flex: 1, backgroundColor: color.sky }} />
    </View>
  );
}

/** Solid viridian header band with the pennant at its foot (provider hero). */
export function Banner({ height = 120 }: { height?: number }) {
  return (
    <View style={{ height, backgroundColor: color.viridianDeep, justifyContent: "flex-end" }}>
      <Pennant />
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/** Section title inside a card / screen, matching the web's section headings. */
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

/** label ....... value — for services & pricing, invoice lines, etc. */
export function Row({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, emphasize && { color: color.ink, fontWeight: "600" }]}>
        {label}
      </Text>
      <Text style={[styles.rowValue, emphasize && { ...type.headline }]}>{value}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Identity + status                                                          */
/* -------------------------------------------------------------------------- */

export function Avatar({
  name,
  size = 48,
  onBanner = false,
}: {
  name: string | null | undefined;
  size?: number;
  onBanner?: boolean;
}) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: onBanner ? color.viridian : color.honeydew,
          borderColor: color.paper,
          borderWidth: onBanner ? 4 : 0,
        },
      ]}
    >
      <Text
        style={{
          color: onBanner ? color.onViridian : color.viridian,
          fontWeight: "700",
          fontSize: size * 0.36,
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

export function Badge({ label, tone = "stone" }: { label: string; tone?: Tone }) {
  const c = toneColors[tone];
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { label, tone } = statusMeta(status);
  return <Badge label={label} tone={tone} />;
}

/** "✓ Verified student" trust chip — honeydew, gold check. */
export function VerifiedBadge() {
  return (
    <View style={[styles.badge, { backgroundColor: color.honeydew, flexDirection: "row" }]}>
      <Text style={[styles.badgeText, { color: color.goldStar }]}>✓ </Text>
      <Text style={[styles.badgeText, { color: color.viridian }]}>Verified student</Text>
    </View>
  );
}

export function Rating({ avg, count }: { avg: number | null; count: number | null }) {
  if (avg == null || !count) {
    return <Text style={styles.ratingNew}>New to the crew</Text>;
  }
  return (
    <Text style={styles.rating}>
      <Text style={{ color: color.goldStar }}>★</Text> {avg.toFixed(1)}{" "}
      <Text style={{ color: color.mist }}>
        ({count} review{count === 1 ? "" : "s"})
      </Text>
    </Text>
  );
}

/** Small pill — service filters, service tags, weekday chips. */
export function Chip({
  label,
  selected,
  count,
  onPress,
}: {
  label: string;
  selected?: boolean;
  count?: number;
  onPress?: () => void;
}) {
  const body = (
    <View style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}>
      <Text style={[styles.chipText, { color: selected ? color.onViridian : color.ink }]}>
        {label}
      </Text>
      {count != null ? (
        <Text style={[styles.chipCount, { color: selected ? color.honeydew : color.mist }]}>
          {count}
        </Text>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      {body}
    </Pressable>
  );
}

/** Honeydew uppercase eyebrow, matching the web's brand-eyebrow. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <View style={styles.eyebrow}>
      <Text style={styles.eyebrowText}>{children}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty / loading / error states                                            */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? <View style={{ marginTop: space.lg, alignSelf: "stretch" }}>{action}</View> : null}
    </View>
  );
}

export function Center({ children }: { children: React.ReactNode }) {
  return <View style={styles.center}>{children}</View>;
}

export function Loading() {
  return (
    <Center>
      <ActivityIndicator color={color.viridian} />
    </Center>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <Text style={styles.errorNote}>{message}</Text>;
}

/** Footnote used across booking surfaces (the website's billing microcopy). */
export function BillingNote() {
  return (
    <Text style={styles.billingNote}>One-hour minimum, then billed in 15-minute increments.</Text>
  );
}

/* -------------------------------------------------------------------------- */

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  buttonSm: { minHeight: 40, paddingHorizontal: space.md },
  buttonPrimary: { backgroundColor: color.viridian },
  buttonSecondary: { borderWidth: 1, borderColor: color.viridian, backgroundColor: "transparent" },
  buttonGhost: { backgroundColor: "transparent" },
  buttonText: { fontSize: type.headline.fontSize, fontWeight: type.headline.fontWeight },
  label: { fontSize: type.subhead.fontSize, fontWeight: "500", color: color.ink },
  input: {
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.input,
    backgroundColor: color.paper,
    paddingHorizontal: space.md,
    minHeight: 50,
    fontSize: type.body.fontSize,
    color: color.ink,
  },
  error: { fontSize: type.footnote.fontSize, color: color.danger },
  hint: { fontSize: type.footnote.fontSize, color: color.inkSoft },

  card: {
    backgroundColor: color.card,
    borderColor: color.line,
    borderWidth: 1,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  pennant: { height: 4, flexDirection: "row" },
  divider: { height: 1, backgroundColor: color.line },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { ...type.title2, color: color.ink },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  rowLabel: { ...type.body, color: color.inkSoft, flexShrink: 1 },
  rowValue: { ...type.body, color: color.ink, fontWeight: "500" },

  avatar: { alignItems: "center", justifyContent: "center" },
  badge: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: type.footnote.fontSize, fontWeight: "600" },

  rating: { fontSize: type.footnote.fontSize, color: color.inkSoft, fontWeight: "500" },
  ratingNew: { fontSize: type.footnote.fontSize, color: color.mist, fontWeight: "500" },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  chipIdle: { backgroundColor: color.paper, borderColor: color.line },
  chipSelected: { backgroundColor: color.viridian, borderColor: color.viridian },
  chipText: { fontSize: type.subhead.fontSize, fontWeight: "500" },
  chipCount: { fontSize: type.footnote.fontSize, fontWeight: "700" },

  eyebrow: {
    alignSelf: "flex-start",
    backgroundColor: color.honeydew,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  eyebrowText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: color.viridian,
    textTransform: "uppercase",
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.sm,
  },
  emptyTitle: { ...type.title2, color: color.ink, textAlign: "center" },
  emptyBody: {
    fontSize: type.subhead.fontSize,
    color: color.inkSoft,
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 21,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl },
  errorNote: {
    fontSize: type.subhead.fontSize,
    color: color.inkSoft,
    textAlign: "center",
    padding: space.lg,
  },
  billingNote: { fontSize: 11, color: color.mist },
});
