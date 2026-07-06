import Link from "next/link";

import { Wordmark } from "@/components/site-header";
import { buttonClasses } from "@/components/ui/button";

/** Minimal chrome for shared surfaces (messaging) used by every role. */
export default function SharedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-b border-viridian/10 bg-viridian text-shell">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Wordmark tone="dark" />
          <Link
            href="/"
            className={buttonClasses({
              variant: "secondary",
              size: "sm",
              className: "border-shell/30 text-shell hover:bg-shell/10",
            })}
          >
            Home
          </Link>
        </div>
      </header>
      {children}
    </>
  );
}
