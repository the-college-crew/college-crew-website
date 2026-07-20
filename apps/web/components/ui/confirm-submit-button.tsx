"use client";

import { Button } from "@/components/ui/button";

export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  ...props
}: React.ComponentProps<typeof Button> & { confirmMessage?: string }) {
  return (
    <Button
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          confirmMessage &&
          !window.confirm(confirmMessage)
        ) {
          event.preventDefault();
        }
      }}
    />
  );
}
