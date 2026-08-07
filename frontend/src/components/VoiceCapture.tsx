import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";

interface VoiceCaptureProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onCaptured: (clip: Blob) => void;
}

const MESSAGES: Record<string, string> = {
  denied:
    "Microphone access was blocked. Allow it in your browser settings, or type the entry instead.",
  unsupported:
    "This browser cannot record audio. Try typing the entry instead.",
};

export function VoiceCapture({
  open,
  busy,
  onClose,
  onCaptured,
}: VoiceCaptureProps) {
  const recorder = useVoiceRecorder();
  const problem = MESSAGES[recorder.state];

  async function onStop() {
    const clip = await recorder.stop();
    if (clip) onCaptured(clip);
    else onClose();
  }

  function onCancel() {
    recorder.cancel();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onCancel} title="Record voice">
      <div className="flex flex-col items-center gap-6 pt-2 pb-6">
        {problem ? (
          <p role="alert" className="text-center text-sm text-expense">
            {problem}
          </p>
        ) : (
          <>
            <div
              className={`flex size-28 items-center justify-center rounded-full transition-colors
                ${recorder.state === "recording" ? "bg-expense-wash" : "bg-accent-wash"}`}
            >
              {/* The one pulsing element in the app. It communicates live state, so it
                  is information rather than decoration, and it stops under
                  reduced-motion via the global rule. */}
              <span
                className={`flex size-16 items-center justify-center rounded-full
                  ${
                    recorder.state === "recording"
                      ? "animate-pulse bg-expense text-white"
                      : "bg-accent-fill text-nyx"
                  }`}
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                </svg>
              </span>
            </div>

            <p className="text-center text-mute" aria-live="polite">
              {recorder.state === "recording" ? (
                <>
                  Listening…{" "}
                  <span className="tabular font-medium text-ink">
                    {recorder.seconds}s
                  </span>
                  <br />
                  <span className="text-sm">
                    Say the amount and what it was for.
                  </span>
                </>
              ) : recorder.state === "requesting" ? (
                "Waiting for microphone permission…"
              ) : (
                "Tap start, then say something like “printing four fifty”."
              )}
            </p>
          </>
        )}

        <div className="flex w-full gap-3">
          <Button variant="secondary" onClick={onCancel} type="button">
            Cancel
          </Button>
          {recorder.state === "recording" ? (
            <Button onClick={onStop} loading={busy} type="button">
              Stop &amp; read
            </Button>
          ) : (
            <Button
              onClick={recorder.start}
              disabled={Boolean(problem) || busy}
              type="button"
            >
              Start
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
