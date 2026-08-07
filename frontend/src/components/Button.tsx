import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// Gleam carries dark ink, never white: gold behind white is about 1.9:1. The brand
// uses it the same way, and it is the only reason the primary button reads at 10.5:1.
//
// Only the primary carries the sheen. It is the parent system's flourish for the one
// action a screen is asking for, and putting it on every button would flatten that
// back into decoration.
const VARIANTS: Record<Variant, string> = {
  primary:
    "sheen bg-accent-fill text-nyx hover:bg-accent-fill-hover active:bg-accent-fill-hover " +
    "hover:shadow-[0_10px_24px_-14px_rgba(149,100,0,0.9)]",
  secondary: "bg-card text-ink border border-line hover:border-mute",
  ghost: "bg-transparent text-mute hover:text-ink",
  danger: "bg-transparent text-expense hover:bg-expense/5",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Fills the row. The default on touch layouts. */
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  block = true,
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      // 48px floor: comfortably above the 44px minimum for a screen used without looking.
      className={`min-h-12 rounded-md px-5 font-medium
        transition-[color,background-color,border-color,box-shadow,transform]
        duration-[var(--dur-base)] ease-[var(--ease-standard)]
        not-disabled:active:scale-[0.985]
        disabled:cursor-not-allowed disabled:opacity-45
        ${VARIANTS[variant]} ${block ? "w-full" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? "Working…" : children}
    </button>
  );
}
