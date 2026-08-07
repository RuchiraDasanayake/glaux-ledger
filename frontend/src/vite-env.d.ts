/// <reference types="vite/client" />

/**
 * Narrows Vite's open `[key: string]: any` env so a typo in a variable name is a compile
 * error rather than a silently undefined value that renders as blank.
 *
 * All optional: a build with none of these set still works, it just falls back to the
 * defaults in `lib/billing.ts` and to the dev proxy for the API.
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PRICE_MONTHLY?: string;
  readonly VITE_PAY_BANK?: string;
  readonly VITE_PAY_ACCOUNT_NAME?: string;
  readonly VITE_PAY_ACCOUNT_NUMBER?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
