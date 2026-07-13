import { Wordmark } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import {
  dashboardLabelFor,
  getEffectiveRole,
  getSession,
  homePathFor,
} from "@/lib/auth/session";
import { getUnreadSummary } from "@/lib/messaging/unread";
import { createClient } from "@/lib/supabase/server";

/** Minimal chrome for shared surfaces (account, messaging) used by every role. */
export default async function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const role = session
    ? ((await getEffectiveRole()) ?? session.profile.role)
    : null;
  const unreadCount = session
    ? (await getUnreadSummary(await createClient())).total
    : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 shrink-0 border-b border-viridian/10 bg-viridian text-shell">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Wordmark tone="dark" />
          {session && role ? (
            <UserMenu
              name={session.profile.full_name}
              email={session.user.email ?? ""}
              homePath={homePathFor(role)}
              realRole={session.profile.role}
              currentRole={role}
              dashboardLabel={dashboardLabelFor(role)}
              unreadCount={unreadCount}
            />
          ) : null}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
