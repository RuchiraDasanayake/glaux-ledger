import { useEffect, useRef, useState, type RefObject } from "react";

type Options = {
  /** Stop observing after the first hit, for one-shot entrances. */
  once?: boolean;
  rootMargin?: string;
  threshold?: number;
};

/**
 * Whether the referenced element is on screen.
 *
 * `Reveal` has its own copy of this because it only ever needs the first hit and
 * wants to disconnect immediately. This one keeps reporting, which is what a
 * looping animation needs: the landing page's ledger demo runs a timer chain, and
 * a timer chain driving an animation nobody can see is just a battery drain on a
 * phone that is probably the shop's only one.
 */
export function useInView<T extends HTMLElement>({
  once = false,
  rootMargin = "0px",
  threshold = 0,
}: Options = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Where the observer is missing, report visible. Anything gated on this is an
    // enhancement, and failing closed would switch it off permanently.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting);
        if (entry.isIntersecting && once) observer.disconnect();
      },
      { rootMargin, threshold },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, rootMargin, threshold]);

  return [ref, inView];
}
