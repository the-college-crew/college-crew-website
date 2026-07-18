import type { Metadata } from "next";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";

import { DeleteAccountForm } from "./delete-form";

export const metadata: Metadata = { title: "Delete account" };

export default async function DeleteAccountPage() {
  await requireUser("/account/delete");

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-8">
      <PageHeader
        title="Delete your account"
        description="Please read this carefully; it can't be undone."
      />

      <Card className="border-red-200 p-6">
        <h2 className="text-sm font-semibold text-ink">
          Deleting your account permanently removes:
        </h2>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
          <li>• Your profile, name, and saved address</li>
          <li>• Your booking history and any reviews</li>
          <li>• Your messages and conversations</li>
          <li>• (Providers) your storefront, services, and pricing</li>
        </ul>
        <p className="mt-4 text-sm text-ink-soft">
          Any upcoming bookings or appointments will be{" "}
          <span className="font-medium text-ink">automatically cancelled</span>.
          There&apos;s no way to recover any of this afterward.
        </p>

        <div className="mt-6 border-t border-line pt-6">
          <DeleteAccountForm />
        </div>
      </Card>
    </div>
  );
}
