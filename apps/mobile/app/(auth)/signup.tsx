import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { Button, Field } from "@/components/ui";
import { color, radius, space, type } from "@/lib/theme";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [over18, setOver18] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter an email and choose a password.");
      return;
    }
    if (!over18) {
      Alert.alert("18+ only", "College Crew is limited to adults 18 and over.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Could not sign up", error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View style={{ flex: 1, padding: space.xl, justifyContent: "center", gap: space.md }}>
        <Text style={{ ...type.title2, color: color.ink, textAlign: "center" }}>
          Check your email
        </Text>
        <Text style={{ ...type.subhead, color: color.inkSoft, textAlign: "center" }}>
          We sent a confirmation link to {email.trim()}. Open it on this phone to finish signing
          up, then come back and log in.
        </Text>
        <Link
          href="/(auth)/login"
          style={{ color: color.viridian, ...type.headline, textAlign: "center" }}
        >
          Back to log in
        </Link>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ ...type.subhead, color: color.inkSoft }}>
          Book trusted student help from your neighborhood.
        </Text>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: over18 }}
          onPress={() => setOver18((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            padding: space.md,
            borderWidth: 1,
            borderColor: over18 ? color.viridian : color.line,
            borderRadius: radius.card,
            backgroundColor: color.paper,
          }}
        >
          <Ionicons
            name={over18 ? "checkbox" : "square-outline"}
            size={22}
            color={over18 ? color.viridian : color.mist}
          />
          <Text style={{ ...type.subhead, color: color.ink, flex: 1 }}>
            I confirm I am 18 or older.
          </Text>
        </Pressable>
        <Button title="Create account" onPress={submit} loading={busy} />
        <Link
          href="/(auth)/login"
          style={{ color: color.viridian, ...type.headline, textAlign: "center" }}
        >
          Already have an account? Log in
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
