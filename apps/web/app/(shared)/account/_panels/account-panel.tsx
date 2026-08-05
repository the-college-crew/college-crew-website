import type { Profile } from "@/lib/db/types";

import { Section } from "../_components/section";
import { AccountPasswordForm, AccountProfileForm } from "../account-forms";
import { GoogleIdentitySettings } from "../google-identity-settings";

export function AccountPanel({
  profile,
  email,
  googleConnected,
  googleEmail,
  googleLinkError,
}: {
  profile: Profile;
  email: string;
  googleConnected: boolean;
  googleEmail: string | null;
  googleLinkError?: boolean;
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

      <Section
        title="Security"
        description="Manage how you sign in to College Crew."
      >
        <div className="space-y-6">
          <GoogleIdentitySettings
            connected={googleConnected}
            email={googleEmail}
            initialError={googleLinkError}
          />
          <div className="border-t border-line pt-5">
            <h3 className="mb-3 text-sm font-semibold">Password</h3>
            <AccountPasswordForm />
          </div>
        </div>
      </Section>
    </>
  );
}
