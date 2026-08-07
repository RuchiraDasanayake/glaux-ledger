import { useEffect, useId, useState } from "react";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import {
  type AdminPaymentFilter,
  useAdminEvidence,
  useAdminPaymentSubmissions,
  useApprovePayment,
  useRejectPayment,
} from "@/hooks/useAdminPayments";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { formatAmount, formatDate, formatPlainDay } from "@/lib/format";
import type { AdminPaymentSubmission } from "@/lib/types";

const FILTERS: Array<{ id: AdminPaymentFilter; label: string }> = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

export function AdminPayments() {
  const [filter, setFilter] = useState<AdminPaymentFilter>("pending");
  const { data = [], isPending, isError, refetch } =
    useAdminPaymentSubmissions(filter);
  const [selected, setSelected] = useState<AdminPaymentSubmission | null>(null);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-display text-3xl tracking-tight">Payments</h1>
        <p className="mt-2 text-mute">
          Review bank slips and extend subscriptions by hand.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Filter by status"
        className="mb-5 flex flex-wrap gap-1 rounded-sm border border-line bg-sunk p-1"
      >
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={filter === option.id}
            onClick={() => setFilter(option.id)}
            className={`min-h-10 rounded-sm px-3 text-sm font-medium transition-colors ${
              filter === option.id
                ? "bg-card text-ink shadow-sm"
                : "text-mute hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isPending && (
        <div aria-hidden="true" className="space-y-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="skeleton h-20 w-full" />
          ))}
        </div>
      )}

      {!isPending && isError && (
        <div
          role="alert"
          className="rounded-md border border-line bg-card px-4 py-4 text-sm"
        >
          <p className="text-mute">Could not load the queue.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 font-medium text-accent underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {!isPending && !isError && data.length === 0 && (
        <p className="rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-mute">
          {filter === "pending"
            ? "No slips waiting for review."
            : "Nothing in this filter."}
        </p>
      )}

      {!isPending && !isError && data.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
          {data.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setSelected(row)}
                className="flex w-full flex-col gap-1 px-4 py-4 text-left transition-colors
                  hover:bg-sunk focus-visible:bg-sunk"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-semibold">{row.business_name}</span>
                  <StatusPill status={row.status} />
                </div>
                <p className="text-sm text-mute">
                  {formatAmount(row.amount)} · transferred{" "}
                  {formatPlainDay(row.transfer_date, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {row.transfer_reference
                    ? ` · ${row.transfer_reference}`
                    : ""}
                </p>
                <p className="text-xs text-mute">
                  Submitted {formatDate(row.created_at)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <ReviewSheet
        submission={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function StatusPill({ status }: { status: AdminPaymentSubmission["status"] }) {
  const tone =
    status === "pending"
      ? "text-accent bg-accent-wash"
      : status === "approved"
        ? "text-income bg-income-wash"
        : "text-expense bg-expense-wash";
  const label =
    status === "pending"
      ? "Pending"
      : status === "approved"
        ? "Approved"
        : "Rejected";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function ReviewSheet({
  submission,
  onClose,
}: {
  submission: AdminPaymentSubmission | null;
  onClose: () => void;
}) {
  const open = submission !== null;
  const formId = useId();
  const [months, setMonths] = useState(1);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"view" | "approve" | "reject">("view");
  const [error, setError] = useState<string | null>(null);

  const evidence = useAdminEvidence(submission?.id ?? null);
  const previewUrl = useObjectUrl(evidence.data);
  const approve = useApprovePayment();
  const reject = useRejectPayment();

  useEffect(() => {
    setMonths(1);
    setReason("");
    setMode("view");
    setError(null);
  }, [submission?.id]);

  async function onApprove() {
    if (!submission) return;
    if (months < 1 || months > 24) {
      setError("Choose between 1 and 24 months.");
      return;
    }
    setError(null);
    try {
      await approve.mutateAsync({ id: submission.id, months });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not approve that.",
      );
    }
  }

  async function onReject() {
    if (!submission) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setError("A rejection reason is required.");
      return;
    }
    setError(null);
    try {
      await reject.mutateAsync({ id: submission.id, reason: trimmed });
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not reject that.",
      );
    }
  }

  function downloadEvidence() {
    if (!evidence.data || !submission || !previewUrl) return;
    const extension = extensionFor(submission.evidence_mime);
    const link = document.createElement("a");
    link.href = previewUrl;
    link.download = `slip-${submission.business_name}${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={submission?.business_name ?? "Payment"}
    >
      {submission && (
        <div className="flex flex-col gap-4 pb-6">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Meta label="Amount" value={formatAmount(submission.amount)} />
            <Meta
              label="Transfer date"
              value={formatPlainDay(submission.transfer_date, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            />
            <Meta
              label="Reference"
              value={submission.transfer_reference || "—"}
            />
            <Meta label="Status" value={submission.status} />
            <Meta
              label="Submitted"
              value={formatDate(submission.created_at)}
            />
            <Meta
              label="File"
              value={`${submission.evidence_mime} · ${Math.round(submission.evidence_size / 1024)} KB`}
            />
          </dl>

          {submission.review_note && (
            <p className="rounded-sm bg-sunk px-3 py-2 text-sm text-mute">
              Note: {submission.review_note}
            </p>
          )}

          <section aria-label="Payment evidence">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Evidence</h3>
              <button
                type="button"
                onClick={downloadEvidence}
                disabled={!previewUrl}
                className="text-sm font-medium text-accent underline underline-offset-2
                  disabled:opacity-40"
              >
                Download
              </button>
            </div>

            {evidence.isPending && (
              <p className="text-sm text-mute" role="status">
                Loading evidence…
              </p>
            )}
            {evidence.isError && (
              <p role="alert" className="text-sm text-expense">
                Could not load the slip.{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => void evidence.refetch()}
                >
                  Retry
                </button>
              </p>
            )}
            {previewUrl && submission.evidence_mime.startsWith("image/") && (
              <img
                src={previewUrl}
                alt={`Bank slip from ${submission.business_name}`}
                className="max-h-80 w-full rounded-sm border border-line object-contain bg-sunk"
              />
            )}
            {previewUrl && submission.evidence_mime === "application/pdf" && (
              <iframe
                title={`Bank slip PDF from ${submission.business_name}`}
                src={previewUrl}
                sandbox=""
                className="h-80 w-full rounded-sm border border-line bg-sunk"
              />
            )}
          </section>

          {submission.status === "pending" && mode === "view" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => setMode("approve")}>
                Approve…
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMode("reject")}
              >
                Reject…
              </Button>
            </div>
          )}

          {mode === "approve" && (
            <div className="flex flex-col gap-3 rounded-sm border border-line p-4">
              <p className="text-sm font-semibold">Confirm approval</p>
              <p className="text-sm text-mute">
                Extend {submission.business_name}&apos;s subscription from the
                later of today or their current paid-through date.
              </p>
              <div>
                <label
                  htmlFor={`${formId}-months`}
                  className="mb-1.5 block text-xs font-medium text-mute"
                >
                  Months to add
                </label>
                <input
                  id={`${formId}-months`}
                  type="number"
                  min={1}
                  max={24}
                  data-sheet-focus
                  value={months}
                  onChange={(event) => setMonths(Number(event.target.value))}
                  className="min-h-11 w-full rounded-sm border border-line bg-card px-3
                    focus:border-accent"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-expense">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button
                  type="button"
                  loading={approve.isPending}
                  onClick={() => void onApprove()}
                >
                  Confirm approve
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={approve.isPending}
                  onClick={() => {
                    setMode("view");
                    setError(null);
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {mode === "reject" && (
            <div className="flex flex-col gap-3 rounded-sm border border-line p-4">
              <p className="text-sm font-semibold">Confirm rejection</p>
              <div>
                <label
                  htmlFor={`${formId}-reason`}
                  className="mb-1.5 block text-xs font-medium text-mute"
                >
                  Reason shown to the shop
                </label>
                <textarea
                  id={`${formId}-reason`}
                  data-sheet-focus
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="w-full rounded-sm border border-line bg-card px-3 py-2
                    focus:border-accent"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-expense">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button
                  type="button"
                  variant="danger"
                  loading={reject.isPending}
                  onClick={() => void onReject()}
                >
                  Confirm reject
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={reject.isPending}
                  onClick={() => {
                    setMode("view");
                    setError(null);
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}

function extensionFor(contentType: string): string {
  if (contentType === "application/pdf") return ".pdf";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg") return ".jpg";
  return "";
}
