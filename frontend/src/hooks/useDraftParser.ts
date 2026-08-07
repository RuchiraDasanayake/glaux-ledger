import { useState } from "react";
import type { DraftValues } from "@/components/DraftSheet";
import { api } from "@/lib/api";
import type { DraftEntry, EntrySource } from "@/lib/types";

type UncertainField = "amount" | "category" | "note";

/**
 * Sends a recording or photo for parsing and converts the reply into sheet values.
 *
 * The result is only ever a proposal. Nothing reaches the database until the user
 * presses Save in the sheet.
 */
export function useDraftParser() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse(
    file: Blob,
    source: Extract<EntrySource, "voice" | "photo">,
  ) {
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append(
        "file",
        file,
        source === "voice" ? "clip.webm" : "receipt.jpg",
      );
      const draft = await api.upload<DraftEntry>(
        `/transactions/from-${source}`,
        formData,
      );
      return toDraftValues(draft);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not read that.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { parse, busy, error, clearError: () => setError(null) };
}

function toDraftValues(draft: DraftEntry): DraftValues {
  return {
    amount: draft.amount.value ?? "",
    categoryId: draft.category_id.value,
    note: draft.note.value ?? "",
    source: draft.source,
    rawText: draft.raw_text,
    uncertain: draft.uncertain.filter(isUncertainField),
    counterparty: draft.counterparty.value ?? "",
    onCredit: draft.on_credit.value,
  };
}

function isUncertainField(value: string): value is UncertainField {
  return value === "amount" || value === "category" || value === "note";
}
