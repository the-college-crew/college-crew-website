"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { updateProviderText } from "@/app/(admin)/admin/actions";
import { cn } from "@/lib/utils";

/**
 * Inline editor for a provider's free-text profile fields, used by the admin
 * profile popup to strip inappropriate content. Adapted from the site
 * page-editor (<EditableText>): a plain span until the modal's edit mode is on;
 * then double-click turns the span contentEditable in place. Enter saves,
 * Shift+Enter inserts a newline, Esc cancels, blur saves. Unlike the site
 * editor there is no "reset to default" — a provider's copy has no code default.
 *
 * Saves go through the service-role updateProviderText action (admin-gated).
 * An empty value is allowed so an inappropriate name/bio can be cleared.
 */
export function EditableProviderField({
  providerId,
  field,
  value,
  editing: editMode,
  placeholder,
  onSaved,
  className,
}: {
  providerId: string;
  field: "display_name" | "bio" | "company_name";
  value: string;
  editing: boolean;
  placeholder?: string;
  onSaved?: (value: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [snapshot, setSnapshot] = useState(value);
  // Bridges the gap between a successful save and the refreshed prop.
  const [localValue, setLocalValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [editableMode, setEditableMode] = useState<"plaintext-only" | true>(
    "plaintext-only",
  );

  const shown = localValue ?? value;

  // Adjust-during-render: drop the post-save bridge once a fresh prop arrives,
  // and abandon a draft if edit mode is switched off mid-edit.
  const [seenValue, setSeenValue] = useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    setLocalValue(null);
  }
  if (!editMode && isEditing) {
    setIsEditing(false);
    setError(null);
  }

  useEffect(() => {
    if (isEditing) ref.current?.focus();
  }, [isEditing]);

  const startEditing = () => {
    if (isEditing || pending) return;
    // Older Firefox throws on plaintext-only; fall back to a paste sanitizer.
    const probe = document.createElement("span");
    try {
      probe.contentEditable = "plaintext-only";
      setEditableMode("plaintext-only");
    } catch {
      setEditableMode(true);
    }
    setSnapshot(shown);
    setError(null);
    setIsEditing(true);
  };

  const finishEditing = () => {
    setIsEditing(false);
    setError(null);
  };

  const save = () => {
    const el = ref.current;
    if (!el) return;
    const text = el.innerText.replace(/\u00a0/g, " ").trim();
    if (text === snapshot.trim()) {
      el.innerText = snapshot;
      finishEditing();
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("providerId", providerId);
      fd.set("field", field);
      fd.set("value", text);
      const result = await updateProviderText(fd);
      if (!result.ok) {
        setError(result.error);
        return; // keep the draft so the edit can be retried
      }
      setLocalValue(text);
      onSaved?.(text);
      finishEditing();
    });
  };

  const cancel = () => {
    const el = ref.current;
    if (el) el.innerText = snapshot;
    finishEditing();
  };

  if (!editMode) {
    return (
      <span className={cn("whitespace-pre-line", className)}>
        {shown || placeholder}
      </span>
    );
  }

  const isEmpty = !isEditing && !shown;

  return (
    <span className={cn("group/edit relative", className)}>
      <span
        ref={ref}
        title="Double-click to edit"
        contentEditable={isEditing ? editableMode : undefined}
        suppressContentEditableWarning
        onDoubleClick={startEditing}
        onKeyDown={(e) => {
          if (!isEditing) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        onBlur={() => {
          if (isEditing && !pending) save();
        }}
        onPaste={(e) => {
          if (!isEditing) return;
          e.preventDefault();
          document.execCommand(
            "insertText",
            false,
            e.clipboardData.getData("text/plain"),
          );
        }}
        className={cn(
          "whitespace-pre-line rounded-sm outline-dashed outline-1 outline-offset-2 cursor-text",
          error ? "outline-red-500" : "outline-amber-500/70",
          isEditing && "outline-2 bg-amber-50/40",
          pending && "animate-pulse opacity-60",
          isEmpty && "italic text-mist",
        )}
      >
        {isEditing ? snapshot : shown || placeholder}
      </span>
      {error ? (
        <span className="ml-1 align-baseline text-xs font-normal text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
