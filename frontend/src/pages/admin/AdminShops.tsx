import { useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import {
  type AdminShopFilter,
  useAdminOverview,
  useAdminShops,
  useExtendShop,
  useSuspendShop,
  useUnsuspendShop,
} from "@/hooks/useAdminShops";
import { formatDate, formatPlainDay } from "@/lib/format";
import { delay } from "@/lib/motion";
import { useToast } from "@/lib/toast-context";
import type { AdminShop } from "@/lib/types";

const FILTERS: Array<{ id: AdminShopFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "trialing", label: "Trial" },
  { id: "active", label: "Paying" },
  { id: "lapsed", label: "Lapsed" },
  { id: "suspended", label: "Suspended" },
];

const MONTH_PRESETS = [1, 3, 6, 12] as const;

function parseFilter(raw: string | null): AdminShopFilter {
  if (
    raw === "trialing" ||
    raw === "active" ||
    raw === "lapsed" ||
    raw === "suspended" ||
    raw === "all"
  ) {
    return raw;
  }
  return "all";
}

export function AdminShops() {
  const [params, setParams] = useSearchParams();
  const filter = parseFilter(params.get("status"));
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [debounced, setDebounced] = useState(query);
  const [selected, setSelected] = useState<AdminShop | null>(null);
  const { data: overview } = useAdminOverview();

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(query), 220);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setParams(
      (prev) => {
        const trimmed = debounced.trim();
        const current = prev.get("q") ?? "";
        if (trimmed === current) return prev;
        const copy = new URLSearchParams(prev);
        if (trimmed) copy.set("q", trimmed);
        else copy.delete("q");
        return copy;
      },
      { replace: true },
    );
  }, [debounced, setParams]);

  const { data = [], isPending, isError, refetch } = useAdminShops(
    filter,
    debounced,
  );

  function setFilter(next: AdminShopFilter) {
    const copy = new URLSearchParams(params);
    if (next === "all") copy.delete("status");
    else copy.set("status", next);
    setParams(copy, { replace: true });
  }

  const emptyCopy = useMemo(() => {
    if (debounced.trim()) return "No shops match that search.";
    if (filter === "trialing") return "Nobody is on trial right now.";
    if (filter === "active") return "No paying shops yet.";
    if (filter === "lapsed") return "No lapsed shops.";
    if (filter === "suspended") return "No suspended shops.";
    return "No shops registered yet.";
  }, [debounced, filter]);

  const filterCount = (id: AdminShopFilter): number | null => {
    if (!overview) return null;
    if (id === "all") return overview.shops_total;
    if (id === "trialing") return overview.shops_trialing;
    if (id === "active") return overview.shops_active;
    if (id === "lapsed") return overview.shops_lapsed;
    return overview.shops_suspended;
  };

  return (
    <div>
      <header style={delay(40)} className="rise mb-6">
        <h1 className="font-display text-3xl tracking-tight">Shops</h1>
        <p className="mt-2 text-mute">
          Find a tenant, extend paid time, or suspend access.
        </p>
      </header>

      <div style={delay(100)} className="rise mb-4">
        <label htmlFor="shop-search" className="sr-only">
          Search shops
        </label>
        <input
          id="shop-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by shop name or owner email"
          autoComplete="off"
          className="min-h-12 w-full rounded-sm border border-line bg-card px-3
            placeholder:text-mute focus:border-accent"
        />
      </div>

      <div
        role="tablist"
        aria-label="Filter shops"
        className="mb-5 flex flex-wrap gap-1 rounded-sm border border-line bg-sunk p-1"
      >
        {FILTERS.map((option) => {
          const count = filterCount(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={`min-h-10 rounded-sm px-3 text-sm font-medium transition-colors ${
                filter === option.id
                  ? "bg-card text-ink shadow-sm"
                  : "text-mute hover:text-ink"
              }`}
            >
              {option.label}
              {count !== null && (
                <span
                  className={`ml-1.5 tabular-nums ${
                    filter === option.id ? "text-mute" : "text-mute/80"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isPending && (
        <div aria-hidden="true" className="space-y-2">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="skeleton h-20 w-full" />
          ))}
        </div>
      )}

      {!isPending && isError && (
        <div
          role="alert"
          className="rounded-md border border-line bg-card px-4 py-4 text-sm"
        >
          <p className="text-mute">Could not load shops.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 font-medium text-accent underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      {!isPending && !isError && data.length === 0 && (
        <p className="rounded-md border border-dashed border-line px-4 py-10 text-center text-sm text-mute">
          {emptyCopy}
        </p>
      )}

      {!isPending && !isError && data.length > 0 && (
        <>
          <p className="mb-2 text-xs text-mute" aria-live="polite">
            {data.length} shop{data.length === 1 ? "" : "s"}
            {debounced.trim() ? " matching" : ""}
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card">
            {data.map((shop) => (
              <li key={shop.id}>
                <button
                  type="button"
                  onClick={() => setSelected(shop)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors
                    hover:bg-sunk focus-visible:bg-sunk"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="font-semibold">{shop.name}</span>
                      <ShopStatusPill shop={shop} />
                    </div>
                    <p className="mt-1 truncate text-sm text-mute">
                      {shop.owner_email}
                    </p>
                    <p className="mt-0.5 text-xs text-mute">
                      Joined {formatDate(shop.created_at)}
                      {shop.paid_through
                        ? ` · paid through ${formatPlainDay(shop.paid_through, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`
                        : shop.status === "trialing" && !shop.disabled_at
                          ? ` · ${shop.trial_days_left}d trial left`
                          : ""}
                    </p>
                  </div>
                  <span aria-hidden="true" className="text-mute">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ShopSheet shop={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ShopStatusPill({ shop }: { shop: AdminShop }) {
  if (shop.disabled_at) {
    return (
      <span className="rounded-full bg-sunk px-2.5 py-1 text-xs font-medium text-mute">
        Suspended
      </span>
    );
  }
  const tone =
    shop.status === "trialing"
      ? "text-accent bg-accent-wash"
      : shop.status === "active"
        ? "text-income bg-income-wash"
        : "text-expense bg-expense-wash";
  const label =
    shop.status === "trialing"
      ? "Trial"
      : shop.status === "active"
        ? "Paying"
        : "Lapsed";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

function ShopSheet({
  shop,
  onClose,
}: {
  shop: AdminShop | null;
  onClose: () => void;
}) {
  const open = shop !== null;
  const formId = useId();
  const toast = useToast();
  const [months, setMonths] = useState(1);
  const [mode, setMode] = useState<"view" | "extend" | "suspend">("view");
  const [error, setError] = useState<string | null>(null);
  const extend = useExtendShop();
  const suspend = useSuspendShop();
  const unsuspend = useUnsuspendShop();
  const [live, setLive] = useState<AdminShop | null>(shop);

  useEffect(() => {
    setMonths(1);
    setMode("view");
    setError(null);
    setLive(shop);
  }, [shop?.id, shop]);

  async function onExtend() {
    if (!shop) return;
    if (months < 1 || months > 24) {
      setError("Choose between 1 and 24 months.");
      return;
    }
    setError(null);
    try {
      await extend.mutateAsync({ id: shop.id, months });
      toast(
        `Extended ${shop.name} by ${months} month${months === 1 ? "" : "s"}.`,
        "success",
      );
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not extend that shop.",
      );
    }
  }

  async function onSuspend() {
    if (!shop) return;
    setError(null);
    try {
      await suspend.mutateAsync(shop.id);
      toast(`${shop.name} is suspended.`, "success");
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not suspend that shop.",
      );
    }
  }

  async function onUnsuspend() {
    if (!shop) return;
    setError(null);
    try {
      const updated = await unsuspend.mutateAsync(shop.id);
      setLive(updated);
      toast(`${shop.name} can write again.`, "success");
      setMode("view");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not restore that shop.",
      );
    }
  }

  const current = live ?? shop;
  const busy = extend.isPending || suspend.isPending || unsuspend.isPending;

  return (
    <BottomSheet open={open} onClose={onClose} title={current?.name ?? "Shop"}>
      {current && (
        <div className="flex flex-col gap-4 pb-6">
          {current.disabled_at && mode === "view" && (
            <p
              role="status"
              className="rounded-sm border border-line bg-sunk px-3 py-2.5 text-sm text-mute"
            >
              Writing is blocked until you restore access or extend paid time.
            </p>
          )}

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Meta label="Owner" value={current.owner_email} />
            <Meta
              label="Status"
              value={
                current.disabled_at
                  ? "Suspended"
                  : current.status === "trialing"
                    ? "Trial"
                    : current.status === "active"
                      ? "Paying"
                      : "Lapsed"
              }
            />
            <Meta label="Trial ends" value={formatDate(current.trial_ends_at)} />
            <Meta
              label="Paid through"
              value={
                current.paid_through
                  ? formatPlainDay(current.paid_through, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"
              }
            />
            <Meta label="Timezone" value={current.timezone} />
            <Meta label="Currency" value={current.currency} />
            <Meta label="Joined" value={formatDate(current.created_at)} />
            <Meta
              label="Trial left"
              value={
                current.status === "trialing" && !current.disabled_at
                  ? `${current.trial_days_left} day${current.trial_days_left === 1 ? "" : "s"}`
                  : "—"
              }
            />
          </dl>

          {mode === "view" && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" onClick={() => setMode("extend")}>
                Extend paid time…
              </Button>
              {current.disabled_at ? (
                <Button
                  type="button"
                  variant="secondary"
                  loading={unsuspend.isPending}
                  onClick={() => void onUnsuspend()}
                >
                  Restore access
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setMode("suspend")}
                >
                  Suspend…
                </Button>
              )}
            </div>
          )}

          {mode === "extend" && (
            <div className="flex flex-col gap-3 rounded-sm border border-line p-4">
              <p className="text-sm font-semibold">Extend subscription</p>
              <p className="text-sm text-mute">
                Adds months from the later of today or their current paid-through
                date. Also clears a suspension.
              </p>
              <div
                role="group"
                aria-label="Quick month presets"
                className="flex flex-wrap gap-2"
              >
                {MONTH_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMonths(preset)}
                    className={`min-h-10 rounded-sm border px-3 text-sm font-medium transition-colors ${
                      months === preset
                        ? "border-accent bg-accent-wash text-accent"
                        : "border-line text-mute hover:border-mute hover:text-ink"
                    }`}
                  >
                    {preset} mo
                  </button>
                ))}
              </div>
              <div>
                <label
                  htmlFor={`${formId}-months`}
                  className="mb-1.5 block text-xs font-medium text-mute"
                >
                  Months to add
                </label>
                <input
                  id={`${formId}-months`}
                  type="number"
                  min={1}
                  max={24}
                  data-sheet-focus
                  value={months}
                  onChange={(event) => setMonths(Number(event.target.value))}
                  className="min-h-11 w-full rounded-sm border border-line bg-card px-3
                    focus:border-accent"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-expense">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button
                  type="button"
                  loading={extend.isPending}
                  onClick={() => void onExtend()}
                >
                  Confirm extend
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setMode("view");
                    setError(null);
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {mode === "suspend" && (
            <div className="flex flex-col gap-3 rounded-sm border border-line p-4">
              <p className="text-sm font-semibold">Suspend this shop</p>
              <p className="text-sm text-mute">
                They can still sign in and export history, but new entries are
                blocked until you restore access or extend paid time.
              </p>
              {error && (
                <p role="alert" className="text-sm text-expense">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button
                  type="button"
                  variant="danger"
                  loading={suspend.isPending}
                  onClick={() => void onSuspend()}
                >
                  Confirm suspend
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setMode("view");
                    setError(null);
                  }}
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {error && mode === "view" && (
            <p role="alert" className="text-sm text-expense">
              {error}
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-mute">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}
