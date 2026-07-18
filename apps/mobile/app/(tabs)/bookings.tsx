import { router } from "expo-router";
import { Button, EmptyState } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function Bookings() {
  const { session } = useSession();

  if (!session) {
    return (
      <EmptyState
        title="Your bookings live here"
        body="Log in to request services and track every booking from request to completion."
        action={<Button title="Log in" onPress={() => router.push("/(auth)/login")} />}
      />
    );
  }

  return (
    <EmptyState
      title="No bookings yet"
      body="When you book a provider, it will show up here with live status updates."
    />
  );
}
