import { Wordmark } from "@/components/site-header";
import { UserMenu } from "@/components/user-menu";
import {
  dashboardLabelFor,
  getEffectiveRole,
  getSession,
  homePathFor,
} from "@/lib/auth/session";

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

  return (
    <>
      <header className="border-b border-viridian/10 bg-viridian text-shell">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Wordmark tone="dark" />
          {session && role ? (
            <UserMenu
              name={session.profile.full_name}
              email={session.user.email ?? ""}
              homePath={homePathFor(role)}
              dashboardLabel={dashboardLabelFor(role)}
            />
          ) : null}
        </div>
      </header>
      {children}
    </>
  );
}
