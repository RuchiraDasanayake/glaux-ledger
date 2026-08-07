import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Eases a number towards its new value so a confirmed entry visibly lands in the day's
 * total. This is the one piece of decorative motion in the app.
 *
 * The first value is never animated: counting up from zero on page load would be
 * noise rather than feedback.
 */
export function useCountUp(target: number, durationMs = 450): number {
  const reducedMotion = useReducedMotion();
  const [displayed, setDisplayed] = useState(target);
  const previous = useRef(target);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const from = previous.current;
    previous.current = target;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      setDisplayed(target);
      return;
    }

    if (reducedMotion || from === target) {
      setDisplayed(target);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      // easeOutCubic: fast arrival, gentle settle.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(from + (target - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs, reducedMotion]);

  return displayed;
}
