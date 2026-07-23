import Link from "next/link";

import {
  badgeCount,
  type SettingsReadiness,
  type SettingsTabId,
} from "@/lib/provider/settings-readiness";
import { cn } from "@/lib/utils";

import type { SettingsTab } from "./tabs";

/**
 * Settings category rail: a vertical sidebar at md+, a horizontal scroller on
 * phones. Each row links to `/account?tab=…` so the server renders only the
 * active panel and the back button works.
 *
 * Rows carry the same red count pill as the Messages row in the user menu, and
 * only for setup the provider can personally resolve.
 */
export function SettingsNav({
  activeTab,
  tabs,
  readiness,
}: {
  activeTab: SettingsTabId;
  tabs: readonly SettingsTab[];
  readiness: SettingsReadiness;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0"
    >
      <ul className="flex gap-2 md:flex-col md:gap-0.5">
        {tabs.map((tab) => {
          const count = badgeCount(readiness[tab.id]);
          const active = tab.id === activeTab;

          return (
            <li
              key={tab.id}
              className={cn(
                "shrink-0 md:shrink",
                tab.id === "delete" &&
                  "md:mt-2 md:border-t md:border-line md:pt-2",
              )}
            >
              <Link
                href={`/account?tab=${tab.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-2 whitespace-nowrap rounded-lg border-l-2 px-3 py-2 text-sm transition-colors",
                  active
                    ? "border-gold-400 bg-court font-semibold text-viridian"
                    : "border-transparent text-ink-soft hover:bg-court/70 hover:text-viridian",
                )}
              >
                <span>{tab.label}</span>
                {count > 0 ? (
                  <>
                    <span
                      aria-hidden
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-none text-white"
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                    <span className="sr-only">
                      {count} item{count === 1 ? "" : "s"} need attention
                    </span>
                  </>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
