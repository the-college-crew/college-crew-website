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
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter />
      {modal}
      {isAdmin ? <EditModeToggle /> : null}
      {/* Copy edits land for every open visitor tab, not just the editor. */}
      <RealtimeRefresh channel="site-content" table="site_content" />
    </EditModeProvider>
  );
}
