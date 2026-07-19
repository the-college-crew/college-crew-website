import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { color, radius, space, type } from "@/lib/theme";

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && { transform: [{ scale: 0.98 }] },
        (disabled || loading) && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? color.onViridian : color.viridian} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? color.onViridian : color.viridian }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={color.mist}
        style={[styles.input, error ? { borderColor: color.danger } : null]}
        {...input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** Sign-in prompt used by guarded tabs when browsing signed-out. */
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

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.pill,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  buttonPrimary: {
    backgroundColor: color.viridian,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: color.viridian,
    backgroundColor: "transparent",
  },
  buttonText: {
    fontSize: type.headline.fontSize,
    fontWeight: type.headline.fontWeight,
  },
  label: {
    fontSize: type.subhead.fontSize,
    fontWeight: "500",
    color: color.ink,
  },
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
  error: {
    fontSize: type.footnote.fontSize,
    color: color.danger,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.sm,
  },
  emptyTitle: {
    fontSize: type.title2.fontSize,
    fontWeight: type.title2.fontWeight,
    color: color.ink,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: type.subhead.fontSize,
    color: color.inkSoft,
    textAlign: "center",
    maxWidth: 280,
  },
});
