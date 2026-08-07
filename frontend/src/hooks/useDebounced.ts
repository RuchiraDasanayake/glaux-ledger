import { useEffect, useState } from "react";

/**
 * Trails a fast-changing value by a beat.
 *
 * Typing "electricity" is twelve keystrokes and, straight through, twelve queries --
 * eleven of them answering a prefix nobody asked about, on a phone connection the shop
 * is paying for.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
