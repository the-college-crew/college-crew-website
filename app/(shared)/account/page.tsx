import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getSession, requireUser } from "@/lib/auth/session";

import { AccountPasswordForm, AccountProfileForm } from "./account-forms";

export const metadata: Metadata = { title: "Account settings" };

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="font-display text-xl font-semibold">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-sm text-ink-soft">{description}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export default async function AccountPage() {
  await requireUser("/account");
  const session = await getSession();
  if (!session) redirect("/login?next=/account");
  const { profile, user } = session;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <PageHeader
        title="Account settings"
        description="Manage your profile, password, and account."
      />

      <Section
        title="Profile"
        description="Your name and address. Address helps us match you with nearby neighbors."
      >
        <dl className="mb-5 text-sm">
          <div className="flex justify-between gap-4 border-b border-line py-2.5">
            <dt className="text-mist">Email</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
        </dl>
        <AccountProfileForm profile={profile} />
      </Section>

      <Section title="Security" description="Change your password.">
        <AccountPasswordForm />
      </Section>

      <Section
        title="Delete account"
        description="Permanently remove your account and all associated data. This can't be undone."
      >
        <Link
          href="/account/delete"
          className={buttonClasses({ variant: "danger", size: "sm" })}
        >
          Delete my account
        </Link>
      </Section>
    </div>
  );
}
