import { Alert, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { Button, EmptyState } from "@/components/ui";
import { useSession } from "@/lib/session";
import { color, radius, space, type } from "@/lib/theme";

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
    <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
      <View
        style={{
          backgroundColor: color.card,
          borderColor: color.line,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: space.md,
          gap: space.xs,
        }}
      >
        <Text style={{ ...type.headline, color: color.ink }}>{session.user.email}</Text>
        <Text style={{ ...type.footnote, color: color.inkSoft }}>
          {role === "admin"
            ? "Admin account. Admin tools stay on the website."
            : isProvider
              ? "Provider account. Your work surface is in the Provider tab."
              : "Customer account."}
        </Text>
      </View>
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
  );
}
