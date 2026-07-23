import Link from "next/link";

import { buttonClasses } from "@/components/ui/button";

import { Section } from "../_components/section";

export function DeletePanel() {
  return (
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
  );
}
