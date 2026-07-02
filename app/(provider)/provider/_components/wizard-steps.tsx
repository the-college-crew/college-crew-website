import { cn } from "@/lib/utils";

const STEPS = [
  { key: "account", label: "Account" },
  { key: "verify", label: "Verify" },
  { key: "services", label: "Services" },
  { key: "review", label: "Review" },
] as const;

export type WizardStep = (typeof STEPS)[number]["key"];

/**
 * Onboarding progress (SPEC §8: one form per page, Next/Back). Numbered
 * because the wizard genuinely is a sequence.
 */
export function WizardSteps({ current }: { current: WizardStep }) {
  const currentIndex = STEPS.findIndex((step) => step.key === current);

  return (
    <ol className="mb-6 flex items-center gap-2">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={step.key} className="flex flex-1 flex-col items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full font-display text-sm font-semibold",
                active && "bg-crew-600 text-white",
                done && "bg-quad-500 text-white",
                !active && !done && "border border-line bg-paper text-mist",
              )}
            >
              {done ? "✓" : index + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                active ? "text-ink" : "text-mist",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
