export type EntryType = "income" | "expense";
export type EntrySource = "manual" | "voice" | "photo";
export type Period = "day" | "week" | "month";
export type PaymentMethod = "cash" | "card" | "bank" | "credit";

export type SubscriptionStatus = "trialing" | "active" | "lapsed";

export interface Business {
  id: string;
  name: string;
  timezone: string;
  currency: string;
  /** Derived on the server from the two dates below; never stored. */
  status: SubscriptionStatus;
  trial_ends_at: string;
  trial_days_left: number;
  paid_through: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  business: Business;
}

export interface Me {
  user_id: string;
  email: string;
  business: Business;
}

export interface Category {
  id: string;
  name: string;
  type: EntryType;
  archived_at: string | null;
  archived: boolean;
}

export interface Transaction {
  id: string;
  /** Serialised as a string, not a number: NUMERIC(12,2) does not survive a float. */
  amount: string;
  entry_type: EntryType;
  note: string | null;
  source: EntrySource | null;
  /** When it was typed in. `occurred_at` is when the money actually moved. */
  created_at: string;
  occurred_at: string;
  counterparty: string | null;
  payment_method: PaymentMethod | null;
  due_date: string | null;
  settled_at: string | null;
  voided_at: string | null;
  settled: boolean;
  voided: boolean;
  category: Category;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

export interface CategoryBreakdown {
  category_id: string;
  category_name: string;
  entry_type: EntryType;
  total: string;
  count: number;
}

export interface Summary {
  period: string;
  start_date: string;
  end_date: string;
  timezone: string;
  currency: string;
  income: string;
  expense: string;
  net: string;
  by_category: CategoryBreakdown[];
  /** The same span immediately before this one, for the trend. */
  previous_net: string;
  /** Unsettled and deliberately unwindowed: an old bill is still owed today. */
  outstanding_payable: string;
  outstanding_receivable: string;
  overdue_count: number;
}

export interface RecurringBill {
  id: string;
  name: string;
  amount: string;
  /** 1 to 28. Later days are refused, so no bill can skip February. */
  day_of_month: number;
  counterparty: string | null;
  payment_method: PaymentMethod | null;
  note: string | null;
  active: boolean;
  category: Category;
  /** This month's instance, in the shop's calendar. */
  due_on: string;
  recorded_this_month: boolean;
  /** Active, unrecorded, and its day has arrived. */
  due: boolean;
}

export interface DailyPoint {
  day: string;
  income: string;
  expense: string;
  net: string;
}

export interface DailySeries {
  start_date: string;
  end_date: string;
  timezone: string;
  currency: string;
  /** Every day in the range, quiet ones included as zeroes. */
  points: DailyPoint[];
}

export interface DraftField<T> {
  value: T;
  confidence: number;
}

export interface DraftEntry {
  amount: DraftField<string | null>;
  category_id: DraftField<string | null>;
  note: DraftField<string | null>;
  entry_type: DraftField<EntryType>;
  on_credit: DraftField<boolean>;
  counterparty: DraftField<string | null>;
  source: EntrySource;
  raw_text: string;
  provider: string;
  /** Field names the parser was unsure about: 'amount' | 'category' | 'note'. */
  uncertain: string[];
}

export type PaymentSubmissionStatus = "pending" | "approved" | "rejected";

export interface PaymentSubmission {
  id: string;
  status: PaymentSubmissionStatus;
  /** Decimal JSON from the API; formatAmount accepts string or number. */
  amount: string | number;
  /** YYYY-MM-DD of the bank transfer. */
  transfer_date: string;
  transfer_reference: string | null;
  evidence_mime: string;
  evidence_size: number;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
}

/** Admin queue row: shop identity alongside the submission fields. */
export interface AdminPaymentSubmission extends PaymentSubmission {
  business_id: string;
  business_name: string;
  owner_email: string;
  reviewed_by: string | null;
}

/** Returned by approve/reject; includes the extended paid-through date. */
export interface PaymentReview extends AdminPaymentSubmission {
  paid_through: string | null;
}

export type AdminRole = "admin" | "reviewer";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
}

/** Flat token payload from POST /admin/auth/login. */
export interface AdminTokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user_id: string;
  email: string;
  role: AdminRole;
}

export interface AdminOverview {
  shops_total: number;
  shops_trialing: number;
  shops_active: number;
  shops_lapsed: number;
  shops_suspended: number;
  pending_payments: number;
  shops_joined_7d: number;
}

export interface AdminShop {
  id: string;
  name: string;
  owner_email: string;
  timezone: string;
  currency: string;
  status: SubscriptionStatus;
  trial_ends_at: string;
  trial_days_left: number;
  paid_through: string | null;
  disabled_at: string | null;
  created_at: string;
}

/**
 * Product capability flags. Backend field is `ai_parsing_enabled`; the UI treats a
 * missing/false value as capture controls hidden.
 */
export interface Capabilities {
  ai_parsing_enabled: boolean;
}
