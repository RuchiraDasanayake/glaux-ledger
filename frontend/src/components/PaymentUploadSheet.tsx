import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import {
  isAllowedSlip,
  PAYMENT_SLIP_ACCEPT,
  PAYMENT_SLIP_MAX_BYTES,
  useSubmitPayment,
} from "@/hooks/usePayments";
import { useAuth } from "@/lib/auth-context";
import { BILLING } from "@/lib/billing";
import { todayInZone } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

interface PaymentUploadSheetProps {
  open: boolean;
  onClose: () => void;
}

export function PaymentUploadSheet({ open, onClose }: PaymentUploadSheetProps) {
  const { business } = useAuth();
  const toast = useToast();
  const submit = useSubmitPayment();
  const formId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [transferDate, setTransferDate] = useState("");
  const [reference, setReference] = useState(business?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const previewUrl = useMemo(() => {
    if (!file || !file.type.startsWith("image/")) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!open || !business) return;
    setFile(null);
    setAmount("");
    setTransferDate(todayInZone(business.timezone));
    setReference(business.name);
    setError(null);
  }, [open, business]);

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError(null);
    if (!chosen) {
      setFile(null);
      return;
    }
    if (!isAllowedSlip(chosen)) {
      setFile(null);
      setError("Use a JPEG, PNG, or PDF of the transfer slip.");
      return;
    }
    if (chosen.size <= 0) {
      setFile(null);
      setError("That file looks empty. Choose another.");
      return;
    }
    if (chosen.size > PAYMENT_SLIP_MAX_BYTES) {
      setFile(null);
      setError("That file is too large. Keep the slip under 10 MB.");
      return;
    }
    setFile(chosen);
  }

  function validate(): string | null {
    if (!file) return "Add a photo or PDF of the transfer slip.";
    const trimmedAmount = amount.trim();
    if (!trimmedAmount) return "Enter the amount you transferred.";
    const numeric = Number(trimmedAmount.replace(/,/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "Enter a valid transfer amount.";
    }
    if (!transferDate) return "Enter the date of the transfer.";
    if (!reference.trim()) {
      return "Enter the reference you used on the transfer.";
    }
    return null;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    if (!file) return;

    setError(null);
    try {
      await submit.mutateAsync({
        file,
        amount: amount.trim().replace(/,/g, ""),
        transferDate,
        reference: reference.trim(),
      });
      toast("Slip submitted. We will review it shortly.");
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not submit that slip. Try again.",
      );
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Submit payment proof">
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4 pb-6">
        <p className="text-sm text-mute">
          Transfer {BILLING.price} using your shop name as the reference, then
          attach the bank slip. A person reviews it; nothing is auto-charged.
        </p>

        <div>
          <span
            id={`${formId}-file-label`}
            className="mb-1.5 block text-xs font-medium text-mute"
          >
            Bank slip
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept={PAYMENT_SLIP_ACCEPT}
            capture="environment"
            onChange={onFileChosen}
            className="hidden"
            aria-labelledby={`${formId}-file-label`}
          />
          <button
            type="button"
            data-sheet-focus
            onClick={() => fileInputRef.current?.click()}
            className="flex min-h-14 w-full items-center justify-center rounded-sm border
              border-dashed border-line bg-sunk px-4 text-sm font-medium text-ink
              transition-colors hover:border-accent-edge"
          >
            {file ? "Choose a different file" : "Take photo or choose file"}
          </button>
          {file && (
            <div className="mt-3 rounded-sm border border-line bg-card p-3">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Selected bank slip preview"
                  className="mx-auto max-h-48 rounded-sm object-contain"
                />
              ) : (
                <p className="text-sm font-medium">{file.name}</p>
              )}
              <p className="mt-2 text-xs text-mute">
                {(file.size / 1024).toFixed(0)} KB ·{" "}
                {file.type || "file"}
              </p>
            </div>
          )}
        </div>

        <Field
          id={`${formId}-amount`}
          label="Amount transferred"
          value={amount}
          onChange={setAmount}
          inputMode="decimal"
          placeholder="1500"
          autoComplete="off"
        />

        <Field
          id={`${formId}-date`}
          label="Transfer date"
          value={transferDate}
          onChange={setTransferDate}
          type="date"
        />

        <Field
          id={`${formId}-reference`}
          label="Reference used"
          value={reference}
          onChange={setReference}
          autoComplete="off"
        />

        <p className="text-xs text-mute">
          The slip is stored privately so staff can confirm the transfer, and
          kept with your account&apos;s billing records. Voice clips and receipt
          photos used for bookkeeping are still discarded after reading.
        </p>

        {error && (
          <p
            role="alert"
            className="bg-expense-wash rounded-sm px-3 py-2 text-sm text-expense"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button type="submit" loading={submit.isPending}>
            Submit for review
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={submit.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-mute">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="min-h-11 w-full rounded-sm border border-line bg-card px-3
          placeholder:text-mute focus:border-accent"
      />
    </div>
  );
}
