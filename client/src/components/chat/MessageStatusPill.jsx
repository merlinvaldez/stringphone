import React from "react";
import { Loader2 } from "lucide-react";
import { DEFAULT_UI_STRINGS, getStatusLabel } from "../../uiStrings.js";

export function MessageStatusPill({ status, uiStrings = DEFAULT_UI_STRINGS }) {
  const statusLabel = getStatusLabel(status, uiStrings);

  if (status === "ready") {
    return null;
  }

  if (status === "error") {
    return (
      <span
        title={statusLabel}
        aria-label={statusLabel}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10"
      >
        <span className="h-2 w-2 rounded-full bg-rose-300" />
        <span className="sr-only">{statusLabel}</span>
      </span>
    );
  }

  return (
    <span
      title={statusLabel}
      aria-label={statusLabel}
      className="flex h-6 w-6 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-200"
    >
      <Loader2 size={12} className="animate-spin" />
      <span className="sr-only">{statusLabel}</span>
    </span>
  );
}
