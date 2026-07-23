"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";

import { cn } from "@/lib/utils";

function brandfetchLogoUrl(domain: string | null) {
  const clientId = process.env.NEXT_PUBLIC_BRANDFETCH_CLIENT_ID?.trim();
  if (!domain || !clientId) return null;
  return `https://cdn.brandfetch.io/domain/${encodeURIComponent(
    domain,
  )}/w/64/h/64/symbol.png?c=${encodeURIComponent(clientId)}`;
}

/** Recognized-school logo + name, with a deterministic icon fallback. */
export function SchoolIdentity({
  name,
  domain,
  greekOrganization,
  compact = false,
  className,
}: {
  name: string;
  domain: string | null;
  greekOrganization?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const logoUrl = brandfetchLogoUrl(domain);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const logoFailed = logoUrl !== null && failedLogoUrl === logoUrl;

  if (!name.trim()) return null;
  const iconSize = compact ? "h-7 w-7" : "h-9 w-9";

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden text-viridian",
          iconSize,
        )}
      >
        {logoUrl && !logoFailed ? (
          // Direct embedding is required by the Brandfetch Logo API usage guide.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-full w-full object-contain p-0.5"
            onError={() => setFailedLogoUrl(logoUrl)}
          />
        ) : (
          <GraduationCap
            className={compact ? "h-4 w-4" : "h-5 w-5"}
            aria-hidden
          />
        )}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate font-medium text-ink-soft",
            compact ? "text-xs" : "text-sm",
          )}
        >
          {name}
        </span>
        {greekOrganization?.trim() ? (
          <span className="block truncate text-[11px] text-mist">
            {compact ? greekOrganization : `Greek life · ${greekOrganization}`}
          </span>
        ) : null}
      </span>
    </div>
  );
}
