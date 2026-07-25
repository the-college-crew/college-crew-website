"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { resolveConversation } from "@/lib/messaging/resolve-action";

/**
 * Hides this chat from the caller's own inbox (see conversation_resolutions).
 * It reappears automatically if the other party sends a new message.
 */
export function ResolveButton({
  conversationId,
  alreadyResolved,
}: {
  conversationId: string;
  alreadyResolved: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (alreadyResolved) {
    return <span className="text-xs font-medium text-mist">Resolved</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span role="alert" className="text-xs font-medium text-red-700">
          {error}
        </span>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await resolveConversation(conversationId);
            router.push("/messages");
            // The sidebar lives in messages/layout.tsx, which both routes
            // share — and a shared layout does NOT re-render on a client-side
            // navigation between them. Without this the thread would vanish
            // from the pane but linger in the sidebar list.
            router.refresh();
          } catch {
            setError("Could not resolve. Try again.");
            setPending(false);
          }
        }}
      >
        {pending ? "Resolving…" : "Resolve"}
      </Button>
    </div>
  );
}
