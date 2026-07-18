import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/lib/session";
import { color } from "@/lib/theme";

export default function TabsLayout() {
  const { isProvider } = useSession();

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: color.cream },
        headerTintColor: color.ink,
        headerShadowVisible: false,
        tabBarActiveTintColor: color.viridian,
        tabBarInactiveTintColor: color.mist,
        tabBarStyle: { backgroundColor: color.paper, borderTopColor: color.line },
        sceneStyle: { backgroundColor: color.cream },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          headerTitle: "College Crew",
          tabBarIcon: ({ color: c, size }) => <Ionicons name="home" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ color: c, size }) => <Ionicons name="search" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: "Bookings",
          tabBarIcon: ({ color: c, size }) => <Ionicons name="calendar" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ color: c, size }) => (
            <Ionicons name="chatbubble-ellipses" size={size} color={c} />
          ),
        }}
      />
      <Tabs.Screen
        name="provider"
        options={{
          // Provider is a capability, not a role: the tab exists only for
          // accounts that own a provider_profiles row (unified-accounts model).
          href: isProvider ? "/(tabs)/provider" : null,
          title: "Provider",
          tabBarIcon: ({ color: c, size }) => <Ionicons name="briefcase" size={size} color={c} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color: c, size }) => (
            <Ionicons name="person-circle" size={size} color={c} />
          ),
        }}
      />
    </Tabs>
  );
}
