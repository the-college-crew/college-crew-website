import { router } from "expo-router";
import { Button, EmptyState } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function Messages() {
  const { session } = useSession();

  if (!session) {
    return (
      <EmptyState
        title="Chat after you book"
        body="Log in to message your provider once a booking is underway."
        action={<Button title="Log in" onPress={() => router.push("/(auth)/login")} />}
      />
    );
  }

  return (
    <EmptyState
      title="No conversations yet"
      body="Conversations open automatically when a booking starts."
    />
  );
}
