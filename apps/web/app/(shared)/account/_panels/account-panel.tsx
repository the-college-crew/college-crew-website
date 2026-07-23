import type { Profile } from "@/lib/db/types";

import { Section } from "../_components/section";
import { AccountPasswordForm, AccountProfileForm } from "../account-forms";

export function AccountPanel({
  profile,
  email,
}: {
  profile: Profile;
  email: string;
}) {
  return (
    <>
      <Section
        title="Personal details"
        description="Your name and address. Address helps us match you with nearby neighbors."
      >
        <dl className="mb-5 text-sm">
          <div className="flex justify-between gap-4 border-b border-line py-2.5">
            <dt className="text-mist">Email</dt>
            <dd className="font-medium">{email}</dd>
          </div>
        </dl>
        <AccountProfileForm profile={profile} />
      </Section>

      <Section title="Security" description="Change your password.">
        <AccountPasswordForm />
      </Section>
    </>
  );
}
