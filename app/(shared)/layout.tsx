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
      <header className="pennant border-b border-line bg-paper">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Wordmark />
          <Link
            href="/"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            Home
          </Link>
        </div>
      </header>
      {children}
    </>
  );
}
