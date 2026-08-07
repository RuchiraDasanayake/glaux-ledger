import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

/** Rows past this get no delay: half a second of cascade is charm, three is a wait. */
const MAX_STAGGERED = 8;
const STEP_MS = 55;

type RevealProps = {
  children: ReactNode;
  /** Position in a list. Each step adds a small delay so the group cascades. */
  index?: number;
  as?: ElementType;
  className?: string;
};

/**
 * Rise and fade the first time an element scrolls into view.
 *
 * IntersectionObserver rather than a scroll listener: the callback fires once per
 * element rather than on every frame of a scroll, which matters on the mid-range
 * phones this is used on. The observer disconnects itself on the first hit, so a
 * long history does not accumulate watchers.
 *
 * The visual states live in CSS, inside a `prefers-reduced-motion: no-preference`
 * block. Putting the `opacity: 0` there rather than here is the whole trick: if the
 * hidden state were inline and only the animation were suppressed, a reduced-motion
 * user would get content that is invisible forever.
 */
export function Reveal({
  children,
  index = 0,
  as,
  className = "",
}: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Anything already on screen at mount skips the observer entirely, so the first
    // paint of a page is not gated behind a callback that has yet to run.
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      // 5% is enough: a row entering from the bottom edge should already be moving.
      { threshold: 0.05, rootMargin: "0px 0px -5% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={shown ? `reveal-in ${className}` : className}
      style={
        shown
          ? ({
              "--reveal-delay": `${Math.min(index, MAX_STAGGERED) * STEP_MS}ms`,
            } as CSSProperties)
          : undefined
      }
    >
      {children}
    </Tag>
  );
}
