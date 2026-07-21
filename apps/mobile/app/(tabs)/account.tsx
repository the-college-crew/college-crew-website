import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Card, EmptyState, Field, SectionHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { color, space, type } from "@/lib/theme";

export default function Account() {
  const { session, role, isProvider, signOut } = useSession();

  if (!session) {
    return (
      <EmptyState
        title="Your account"
        body="Log in or create an account to book services, message providers, and manage your profile."
        action={
          <View style={{ gap: space.sm }}>
            <Button title="Log in" onPress={() => router.push("/(auth)/login")} />
            <Button
              title="Create account"
              variant="secondary"
              onPress={() => router.push("/(auth)/signup")}
            />
          </View>
        }
      />
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        style={{ backgroundColor: color.cream }}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text style={{ ...type.headline, color: color.ink }}>{session.user.email}</Text>
          <Text style={{ ...type.footnote, color: color.inkSoft, marginTop: space.xs }}>
            {role === "admin"
              ? "Admin account. Admin tools stay on the website."
              : isProvider
                ? "Provider account. Your work surface is in the Provider tab."
                : "Customer account."}
          </Text>
        </Card>

        {isProvider ? <ProviderProfileEditor /> : null}

        <Button
          title="Log out"
          variant="secondary"
          onPress={() => {
            Alert.alert("Log out", "You can log back in any time.", [
              { text: "Cancel", style: "cancel" },
              { text: "Log out", style: "destructive", onPress: () => void signOut() },
            ]);
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Provider storefront text. display_name/bio/company_name UPDATE is revoked
 * from the client (migration 20260713165821); the update-profile-text edge
 * function is the only write path (service-role write + flag-only moderation),
 * exactly like moderate-message owns messages. It identifies the provider by
 * JWT, so this is a write form — current values live on the public profile.
 */
function ProviderProfileEditor() {
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const payload: Record<string, string> = {};
    if (displayName.trim()) payload.displayName = displayName.trim();
    if (companyName.trim()) payload.companyName = companyName.trim();
    if (bio.trim()) payload.bio = bio.trim();
    if (Object.keys(payload).length === 0) {
      Alert.alert("Nothing to update", "Fill in a field before saving.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.functions.invoke("update-profile-text", { body: payload });
    setBusy(false);
    if (error) {
      Alert.alert("Could not save", error.message);
      return;
    }
    setDisplayName("");
    setCompanyName("");
    setBio("");
    Alert.alert("Saved", "Your public profile has been updated.");
  }

  return (
    <Card>
      <SectionHeader title="Edit your public profile" />
      <Text style={{ ...type.footnote, color: color.inkSoft, marginTop: space.xs }}>
        Update the text neighbors see on your listing. Leave a field blank to keep it as is.
      </Text>
      <View style={{ gap: space.md, marginTop: space.md }}>
        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="How your name appears"
          maxLength={80}
        />
        <Field
          label="Company name (optional)"
          value={companyName}
          onChangeText={setCompanyName}
          placeholder="If you run a student business"
          maxLength={120}
        />
        <Field
          label="Bio"
          value={bio}
          onChangeText={setBio}
          multiline
          placeholder="Tell neighbors about yourself and your experience"
          maxLength={2000}
        />
        <Button title="Save profile" onPress={save} loading={busy} />
        <Text style={{ ...type.footnote, color: color.mist }}>
          More profile settings (photo, services, rates, availability) live on thecollegecrew.com.
        </Text>
      </View>
    </Card>
  );
}
