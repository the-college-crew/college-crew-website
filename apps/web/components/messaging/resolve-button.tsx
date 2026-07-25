"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { resolveConversation } from "@/lib/messaging/resolutions";

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

  if (alreadyResolved) {
    return <span className="text-xs font-medium text-mist">Resolved</span>;
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await resolveConversation(conversationId);
        router.push("/messages");
      }}
    >
      {pending ? "Resolving…" : "Resolve"}
    </Button>
  );
}
