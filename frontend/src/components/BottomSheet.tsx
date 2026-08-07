import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * A bottom sheet on a phone, a centred dialog on a desktop.
 *
 * Anchoring to the bottom is right for a device held one-handed, where a centred dialog
 * puts its controls outside the thumb's arc. On a large screen the same anchoring drags
 * the eye to the bottom edge and strands the panel in a corner, so it centres instead.
 * The switch is made in CSS (see .animate-sheet-in) rather than by measuring the
 * viewport, so there is no layout flash on first paint.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement;
    // The field the sheet is really asking for, so the numeric keypad opens immediately.
    // It has to be named rather than found by document order: a sheet that opens with a
    // toggle or a segmented control above its first input would otherwise hand focus to
    // that instead and leave the keyboard shut.
    const target =
      panelRef.current?.querySelector<HTMLElement>("[data-sheet-focus]") ??
      panelRef.current?.querySelector<HTMLElement>(
        "input, select, textarea, button:not([data-sheet-dismiss])",
      );
    target?.focus();

    // The sheet can be taller than the viewport with a keyboard open; locking the body
    // stops the page behind it scrolling instead of the sheet.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="animate-fade-in absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-in safe-bottom relative max-h-[92vh] w-full max-w-md
          overflow-y-auto rounded-t-[var(--radius-sheet)] bg-card px-5 shadow-2xl
          sm:max-h-[85vh] sm:max-w-lg sm:rounded-[var(--radius-sheet)] sm:px-7 sm:pb-7"
      >
        {/* Pinned, because the panel is the scroll container and a long form (the
            entry sheet with its details open) would otherwise scroll its own title
            and close button out of reach. */}
        <div className="sticky top-0 z-10 bg-card pt-3 sm:pt-6">
          {/* Grab affordance on touch. On desktop the close button does that job. */}
          <div
            className="mx-auto mb-4 h-1 w-10 rounded-full bg-line sm:hidden"
            aria-hidden="true"
          />

          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              data-sheet-dismiss
              className="hidden size-8 shrink-0 items-center justify-center rounded-sm text-mute
                transition-colors hover:bg-sunk hover:text-ink sm:flex"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
