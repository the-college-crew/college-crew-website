import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Button, Field } from "@/components/ui";
import { color, space, type } from "@/lib/theme";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Could not log in", error.message);
      return;
    }
    router.replace("/(tabs)");
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
          Welcome back to your neighborhood crew.
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
          textContentType="password"
        />
        <Button title="Log in" onPress={submit} loading={busy} />
        <View style={{ gap: space.sm, alignItems: "center" }}>
          <Link href="/(auth)/forgot-password" style={{ color: color.crew500, ...type.subhead }}>
            Forgot your password?
          </Link>
          <Link href="/(auth)/signup" style={{ color: color.viridian, ...type.headline }}>
            New here? Create an account
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
