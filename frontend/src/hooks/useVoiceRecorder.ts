import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState =
  "idle" | "requesting" | "recording" | "denied" | "unsupported";

// Long enough for a sentence, short enough that a pocket-tapped recording cannot run away.
const MAX_DURATION_MS = 30_000;

/**
 * Records a short clip via MediaRecorder.
 *
 * Kept apart from the upload so a permission failure is distinguishable from a network
 * failure: they need very different messages at a counter.
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const timerRef = useRef<number | null>(null);
  const autoStopRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (autoStopRef.current) window.clearTimeout(autoStopRef.current);
    timerRef.current = null;
    autoStopRef.current = null;
    recorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
  }, []);

  // Releasing the microphone on unmount matters: an abandoned track leaves the OS
  // recording indicator lit, which is alarming on a shop phone.
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setState("unsupported");
      return;
    }

    setState("requesting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("denied");
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      cleanup();
      setState("idle");
      setSeconds(0);
      resolveRef.current?.(blob.size > 0 ? blob : null);
      resolveRef.current = null;
    };

    recorder.start();
    setState("recording");
    setSeconds(0);

    timerRef.current = window.setInterval(
      () => setSeconds((value) => value + 1),
      1000,
    );
    autoStopRef.current = window.setTimeout(
      () => recorder.stop(),
      MAX_DURATION_MS,
    );
  }, [cleanup]);

  /** Resolves with the recorded clip, or null if nothing was captured. */
  const stop = useCallback(() => {
    return new Promise<Blob | null>((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    resolveRef.current = null;
    recorderRef.current?.stop();
    cleanup();
    setState("idle");
    setSeconds(0);
  }, [cleanup]);

  return { state, seconds, start, stop, cancel };
}

function pickMimeType(): string {
  // Safari produces mp4; Chrome and Firefox produce webm. Whisper accepts both, and the
  // stub ignores the type entirely.
  const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}
