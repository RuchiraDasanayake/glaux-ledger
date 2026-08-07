import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ToastContext,
  type ShowToast,
  type ToastTone,
} from "@/lib/toast-context";

const VISIBLE_MS = 2600;
const EXIT_MS = 220;

type Toast = { id: number; message: string; tone: ToastTone; leaving: boolean };

/**
 * Transient confirmations, in one place above the app.
 *
 * This replaces a paragraph that appeared under the buttons on save. That paragraph
 * pushed the layout down for two seconds and then pulled it back up, and it was only
 * visible if you happened to be looking at the top of the page, neither of which is
 * what a confirmation should do.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(window.clearTimeout);
  }, []);

  const show = useCallback<ShowToast>((message, tone = "success") => {
    const id = Date.now() + Math.random();
    // One at a time. Saving three entries quickly should leave the last confirmation
    // on screen, not a stack of three that outlives the interaction.
    setToasts([{ id, message, tone, leaving: false }]);

    timers.current.push(
      window.setTimeout(() => {
        setToasts((current) =>
          current.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
        );
        // Unmounted only after the exit animation, or it would vanish mid-fade.
        timers.current.push(
          window.setTimeout(
            () => setToasts((current) => current.filter((t) => t.id !== id)),
            EXIT_MS,
          ),
        );
      }, VISIBLE_MS),
    );
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}

      {/* Above the mobile tab bar, and out of the way of the sidebar on desktop. Not a
          modal: it never takes focus, so it cannot interrupt someone mid-entry. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center
          gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2.5 rounded-md border px-4 py-2.5 text-sm
              font-medium shadow-[0_10px_30px_-16px_rgba(7,11,18,0.5)]
              ${toast.leaving ? "animate-toast-out" : "animate-toast-in"}
              ${
                toast.tone === "error"
                  ? "bg-expense-wash border-expense/25 text-expense"
                  : "bg-income-wash border-income/25 text-income"
              }`}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0"
            >
              {toast.tone === "error" ? (
                <>
                  <path d="M12 8v5" />
                  <path d="M12 16.5v.01" />
                </>
              ) : (
                <path d="m4.5 12.5 5 5 10-11" />
              )}
            </svg>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
