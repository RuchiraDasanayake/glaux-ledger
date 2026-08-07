import { createContext, useContext } from "react";

export type ToastTone = "success" | "error";

export type ShowToast = (message: string, tone?: ToastTone) => void;

export const ToastContext = createContext<ShowToast | null>(null);

/**
 * Split from the provider component so the module exports only a hook and a context.
 * A file that exports both a component and a hook defeats React Fast Refresh, which
 * remounts the provider on every edit and wipes the state below it.
 */
export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}
