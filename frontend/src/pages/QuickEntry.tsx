import { useRef, useState } from "react";
import { BillsDue } from "@/components/BillsDue";
import { DayTotalHeader } from "@/components/DayTotalHeader";
import { DraftSheet, type DraftValues } from "@/components/DraftSheet";
import { Money } from "@/components/Money";
import { Page } from "@/components/Page";
import { Reveal } from "@/components/Reveal";
import { VoiceCapture } from "@/components/VoiceCapture";
import { useDraftParser } from "@/hooks/useDraftParser";
import { useAiCaptureEnabled } from "@/hooks/useCapabilities";
import { useSummary, useTransactions } from "@/hooks/useLedger";
import { useBusiness } from "@/lib/auth-context";
import { formatTime } from "@/lib/format";
import type { Transaction } from "@/lib/types";

const EMPTY_MANUAL: DraftValues = {
  amount: "",
  categoryId: null,
  note: "",
  source: "manual",
};

/**
 * Four entries is a phone's worth. A desktop has room for twice that beside the entry
 * buttons, and seeing the morning's trading is how a mistake gets noticed at all.
 *
 * Fetched once at the larger number and the tail hidden by CSS below lg, rather than
 * asking matchMedia: a limit that changes with the viewport refetches on every drag of
 * a window edge, and four extra rows cost less than one of those requests.
 */
const RECENT_LIMIT = 8;
const RECENT_ON_PHONE = 4;

export function QuickEntry() {
  const business = useBusiness();
  const { data: summary } = useSummary("day");
  const { data: recent, isPending: loadingRecent } = useTransactions({
    limit: RECENT_LIMIT,
  });
  const { parse, busy, error, clearError } = useDraftParser();
  const aiCapture = useAiCaptureEnabled();

  const [draft, setDraft] = useState<DraftValues | null>(null);
  const [recording, setRecording] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  async function onVoiceCaptured(clip: Blob) {
    const parsed = await parse(clip, "voice");
    setRecording(false);
    if (parsed) setDraft(parsed);
  }

  async function onPhotoChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same photo twice still fires a change event.
    event.target.value = "";
    if (!file) return;
    const parsed = await parse(file, "photo");
    if (parsed) setDraft(parsed);
  }

  // The confirmation itself is a toast raised by the sheet, so nothing here has to
  // reserve layout space for a message that is gone two seconds later.
  function onSaved() {
    setDraft(null);
  }

  return (
    <>
      <DayTotalHeader
        summary={summary}
        currency={business.currency}
        timezone={business.timezone}
      />

      {/* Two columns once there is room. The entry actions stay where the eye lands and
          the recent list moves alongside instead of below, so a desktop user can record
          an entry and watch it appear without scrolling. */}
      <Page title="Record an entry" titleVisibility="never">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
          <section>
            {/* Above the entry buttons because it is time-sensitive and they are not:
                a bill that came due today is the one thing on this screen that will be
                wrong tomorrow if it is missed. */}
            <BillsDue currency={business.currency} />

            {/* Vertically stacked and full width: a thumb arcs up and down, and a
                full-width target cannot be mis-tapped sideways. Voice is largest
                because it is the fastest input while a customer waits. */}
            <div className="flex flex-col gap-3">
              {aiCapture && (
                <>
                  <EntryButton
                    label="Record voice"
                    hint="Say the amount and what it was for"
                    tall
                    disabled={busy}
                    onClick={() => {
                      clearError();
                      setRecording(true);
                    }}
                    icon={
                      <>
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                      </>
                    }
                  />
                  <EntryButton
                    label="Take photo"
                    hint="Snap a bill or receipt"
                    disabled={busy}
                    onClick={() => {
                      clearError();
                      photoInputRef.current?.click();
                    }}
                    icon={
                      <>
                        <path d="M3 7h3l2-2h8l2 2h3v12H3z" />
                        <circle cx="12" cy="13" r="3.5" />
                      </>
                    }
                  />
                </>
              )}
              <EntryButton
                label="Type it"
                hint="Enter the amount yourself"
                tall={!aiCapture}
                onClick={() => setDraft(EMPTY_MANUAL)}
                icon={<path d="M12 5v14M5 12h14" />}
              />
            </div>

            {/* capture="environment" opens the rear camera directly on a phone, while
                still allowing a gallery pick on desktop. */}
            {aiCapture && (
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onPhotoChosen}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
              />
            )}

            {busy && (
              <p role="status" className="mt-4 text-center text-sm text-mute">
                Reading that…
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="bg-expense-wash mt-4 rounded-sm px-3 py-2 text-center text-sm text-expense"
              >
                {error}
              </p>
            )}
          </section>

          <RecentEntries
            transactions={recent?.items ?? []}
            loading={loadingRecent}
            currency={business.currency}
            timezone={business.timezone}
          />
        </div>
      </Page>

      <VoiceCapture
        open={aiCapture && recording}
        busy={busy}
        onClose={() => setRecording(false)}
        onCaptured={onVoiceCaptured}
      />

      <DraftSheet
        open={draft !== null}
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={onSaved}
      />
    </>
  );
}

interface EntryButtonProps {
  label: string;
  hint: string;
  icon: React.ReactNode;
  tall?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function EntryButton({
  label,
  hint,
  icon,
  tall = false,
  disabled = false,
  onClick,
}: EntryButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`lift group flex w-full items-center gap-4 rounded-lg border border-line
        bg-card px-5 text-left active:scale-[0.985] active:bg-sunk disabled:opacity-50
        ${tall ? "min-h-22" : "min-h-18"}`}
    >
      <span
        className={`bg-accent-wash text-accent flex shrink-0 items-center justify-center
          rounded-md transition-colors duration-200 group-hover:bg-accent-fill
          group-hover:text-nyx ${tall ? "size-12" : "size-10"}`}
      >
        <svg
          width={tall ? 24 : 21}
          height={tall ? 24 : 21}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {icon}
        </svg>
      </span>
      <span>
        <span
          className={`block font-semibold ${tall ? "text-lg" : "text-base"}`}
        >
          {label}
        </span>
        <span className="block text-sm text-mute">{hint}</span>
      </span>
    </button>
  );
}

function RecentEntries({
  transactions,
  loading,
  currency,
  timezone,
}: {
  transactions: Transaction[];
  loading: boolean;
  currency: string;
  timezone: string;
}) {
  // One section for all three states, so the heading is not something that arrives with
  // the data. It used to be dropped from the empty case, which meant a shop's very first
  // visit went from four skeleton rows to a single unlabelled line.
  if (loading) {
    return (
      <RecentFrame>
        <ul
          aria-hidden="true"
          className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card"
        >
          {Array.from({ length: RECENT_LIMIT }, (_, row) => (
            <li
              key={row}
              className={`items-center justify-between px-4 py-3.5 ${extraSkeleton(row)}`}
            >
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-28" />
                <div className="skeleton h-3 w-40" />
              </div>
              <div className="skeleton h-4 w-20" />
            </li>
          ))}
        </ul>
      </RecentFrame>
    );
  }

  if (transactions.length === 0) {
    return (
      <RecentFrame>
        <p
          className="rounded-md border border-dashed border-line px-4 py-10 text-center
            text-sm text-mute"
        >
          Nothing recorded yet. Your entries will appear here.
        </p>
      </RecentFrame>
    );
  }

  return (
    <RecentFrame>
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
        {transactions.map((transaction, index) => (
          <Reveal
            as="li"
            key={transaction.id}
            index={index}
            className={`row-live ${extraRow(index)}`}
          >
            <div className="row-shift flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {transaction.category.name}
                </p>
                <p className="truncate text-sm text-mute">
                  {transaction.note ??
                    formatTime(transaction.occurred_at, timezone)}
                </p>
              </div>
              <Money
                value={transaction.amount}
                currency={currency}
                type={transaction.entry_type}
                signed
                className="shrink-0 pl-3"
              />
            </div>
          </Reveal>
        ))}
      </ul>
    </RecentFrame>
  );
}

/**
 * Rows past the phone's four, hidden until there is room. Written out per display value
 * rather than interpolated, because Tailwind finds its classes by reading the source.
 */
function extraRow(index: number): string {
  return index < RECENT_ON_PHONE ? "" : "hidden lg:list-item";
}

function extraSkeleton(index: number): string {
  return index < RECENT_ON_PHONE ? "flex" : "hidden lg:flex";
}

function RecentFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-8 lg:mt-0">
      <h2 className="eyebrow eyebrow-dot mb-2">Recent</h2>
      {children}
    </section>
  );
}
