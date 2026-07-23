import type { SettingsTabId } from "@/lib/provider/settings-readiness";

export type SettingsTab = {
  id: SettingsTabId;
  label: string;
  /** Provider-only tabs are hidden entirely from accounts that don't provide. */
  providerOnly: boolean;
};

export const SETTINGS_TABS: readonly SettingsTab[] = [
  { id: "storefront", label: "Storefront", providerOnly: true },
  { id: "availability", label: "Availability", providerOnly: true },
  { id: "pricing", label: "Pricing", providerOnly: true },
  { id: "payouts", label: "Payouts", providerOnly: true },
  { id: "account", label: "Account", providerOnly: false },
  { id: "legal", label: "Legal", providerOnly: false },
  { id: "delete", label: "Delete account", providerOnly: false },
];

/**
 * `exclude` exists for the admin sample preview, which has no real personal or
 * delete controls to show (those would act on the admin's own account).
 */
export function visibleSettingsTabs(
  isProvider: boolean,
  exclude: readonly SettingsTabId[] = [],
) {
  return SETTINGS_TABS.filter(
    (tab) => (isProvider || !tab.providerOnly) && !exclude.includes(tab.id),
  );
}

/**
 * Maps `?tab=` to a tab the viewer is actually allowed to see. Unknown slugs
 * and provider-only slugs requested by a non-provider fall back to the first
 * visible tab (Storefront for providers, Account for everyone else).
 */
export function resolveSettingsTab(
  slug: string | undefined,
  tabs: readonly SettingsTab[],
): SettingsTabId {
  return tabs.find((tab) => tab.id === slug)?.id ?? tabs[0].id;
}
