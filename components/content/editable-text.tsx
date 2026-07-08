"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  resetSiteContent,
  updateSiteContent,
} from "@/app/actions/site-content";
import { useEditMode } from "@/components/content/edit-mode";
import { cn } from "@/lib/utils";

/**
 * Admin-only interactive leaf behind <Editable>. Renders the resolved copy as
 * a plain span until the layout's edit mode is on; then double-click turns the
 * span contentEditable in place (it inherits the surrounding typography, which
 * a textarea can't). Enter saves, Shift+Enter inserts a newline, Esc cancels,
 * blur saves.
 *
 * While editing the span is deliberately uncontrolled: we render a frozen
 * snapshot so a realtime router.refresh() mid-edit can't clobber the draft
 * (React skips the text node because its vdom didn't change).
 */
export function EditableText({
  k,
  value,
  defaultValue,
  isOverridden,
  className,
}: {
  k: string;
  value: string;
  defaultValue: string;
  isOverridden: boolean;
  className?: string;
}) {
  const { editing: editMode } = useEditMode();
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

  // Adjust-during-render (not effects): drop the post-save bridge once the
  // refreshed prop arrives, and abandon a draft if "Done editing" is toggled
  // mid-edit.
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
    if (!text || text === snapshot.trim()) {
      el.innerText = snapshot;
      finishEditing();
      return;
    }
    startTransition(async () => {
      const result = await updateSiteContent(k, text);
      if (!result.ok) {
        setError(result.error);
        return; // keep the draft so the edit can be retried
      }
      setLocalValue(text);
      finishEditing();
    });
  };

  const cancel = () => {
    const el = ref.current;
    if (el) el.innerText = snapshot;
    finishEditing();
  };

  const reset = () => {
    startTransition(async () => {
      const result = await resetSiteContent(k);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLocalValue(defaultValue);
      setError(null);
    });
  };

  if (!editMode) {
    return (
      <span className={cn("whitespace-pre-line", className)}>{shown}</span>
    );
  }

  return (
    <span className={cn("group/edit relative", className)}>
      <span
        ref={ref}
        title={k}
        contentEditable={isEditing ? editableMode : undefined}
        suppressContentEditableWarning
        onClickCapture={(e) => {
          // Text is inert in edit mode: don't navigate a wrapping <Link> or
          // toggle a wrapping button (FAQ accordion).
          e.preventDefault();
          e.stopPropagation();
        }}
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
        )}
      >
        {isEditing ? snapshot : shown}
      </span>
      {isOverridden && !isEditing ? (
        <button
          type="button"
          title="Reset to original text"
          onClick={reset}
          onDoubleClick={(e) => e.stopPropagation()}
          className="ml-1 hidden align-baseline text-xs text-amber-700 hover:text-amber-900 group-hover/edit:inline"
        >
          ↺
        </button>
      ) : null}
      {error ? (
        <span className="ml-1 align-baseline text-xs font-normal text-red-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
