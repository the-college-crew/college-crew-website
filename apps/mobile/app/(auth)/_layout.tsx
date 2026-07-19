import { Redirect, Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { color } from "@/lib/theme";

export default function AuthLayout() {
  const { session } = useSession();

  // Signed-in users never see the auth flow; the modal closes onto the tabs.
  if (session) return <Redirect href="/(tabs)" />;

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: color.cream },
        headerTintColor: color.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: color.cream },
      }}
    >
      <Stack.Screen name="login" options={{ title: "Log in" }} />
      <Stack.Screen name="signup" options={{ title: "Create account" }} />
      <Stack.Screen name="forgot-password" options={{ title: "Reset password" }} />
    </Stack>
  );
}
