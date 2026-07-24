import { EditModeProvider, EditModeToggle } from "@/components/content/edit-mode";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSession } from "@/lib/auth/session";

export default async function CustomerLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const session = await getSession();
  // Real role, not view-as: the inline copy editor belongs to admins even
  // while they preview as a customer.
  const isAdmin = session?.profile.role === "admin";

  return (
    <EditModeProvider>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter />
      {modal}
      {/* Live copy updates are for whoever is editing, and only an admin can
          edit. Mounting this for anonymous visitors bought a stranger's open
          tab a live-updating headline at the cost of the whole Supabase
          realtime client on first paint — not a trade worth making. */}
      {isAdmin ? (
        <>
          <EditModeToggle />
          <RealtimeRefresh channel="site-content" table="site_content" />
        </>
      ) : null}
    </EditModeProvider>
  );
}
