import { useEffect, useState } from "react";

/**
 * Whether the window has scrolled past `threshold` pixels.
 *
 * Read inside a frame rather than in the listener itself, so a fast scroll asks the
 * browser for `scrollY` once per painted frame instead of once per scroll event.
 * Reading it in the handler is the classic way to force layout on every one.
 */
export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;

    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };

    // A reload halfway down the page starts already scrolled.
    read();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return scrolled;
}
