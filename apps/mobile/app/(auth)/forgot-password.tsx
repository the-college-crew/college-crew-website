import { useState } from "react";
import { Alert, ScrollView, Text } from "react-native";
import { supabase } from "@/lib/supabase";
import { Button, Field } from "@/components/ui";
import { color, space, type } from "@/lib/theme";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (!email.trim()) {
      Alert.alert("Missing email", "Enter the email you signed up with.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setBusy(false);
    if (error) {
      Alert.alert("Could not send reset email", error.message);
      return;
    }
    setSent(true);
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      {sent ? (
        <Text style={{ ...type.subhead, color: color.inkSoft }}>
          If an account exists for {email.trim()}, a reset link is on its way. Open it on this
          phone to choose a new password.
        </Text>
      ) : (
        <>
          <Text style={{ ...type.subhead, color: color.inkSoft }}>
            We will email you a link to reset your password.
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
          <Button title="Send reset link" onPress={submit} loading={busy} />
        </>
      )}
    </ScrollView>
  );
}
