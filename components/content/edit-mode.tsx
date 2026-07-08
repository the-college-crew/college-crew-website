"use client";

import { createContext, useContext, useState } from "react";

/**
 * Edit-mode state for inline copy editing. Plain client context, always
 * mounted in the customer layout so the tree shape is identical for every
 * role; the toggle itself is only rendered for real admins (decided
 * server-side in the layout). Nothing auth-sensitive lives here — the server
 * action re-checks the admin role on every save.
 */

const EditModeContext = createContext<{
  editing: boolean;
  setEditing: (editing: boolean) => void;
}>({ editing: false, setEditing: () => {} });

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <EditModeContext.Provider value={{ editing, setEditing }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}

/** Floating admin-only pill; deliberately resets to "off" on hard reload. */
export function EditModeToggle() {
  const { editing, setEditing } = useEditMode();
  return (
    <button
      type="button"
      onClick={() => setEditing(!editing)}
      className={
        editing
          ? "fixed bottom-4 right-4 z-50 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-amber-600"
          : "fixed bottom-4 right-4 z-50 rounded-full bg-viridian px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:opacity-90"
      }
    >
      {editing ? "Done editing" : "Edit page"}
    </button>
  );
}
