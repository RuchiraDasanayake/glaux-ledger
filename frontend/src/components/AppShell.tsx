import { Link, NavLink, Outlet } from "react-router-dom";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { useAuth } from "@/lib/auth-context";

// Settings is deliberately absent. Four bottom tabs is the comfortable limit on a
// phone, and a settings screen is opened once a month against several times an hour
// for these: it gets the sidebar footer and the mobile header instead.
const TABS = [
  { to: "/", label: "Entry", icon: PlusIcon, end: true },
  { to: "/dashboard", label: "Today", icon: ChartIcon, end: false },
  { to: "/history", label: "History", icon: ListIcon, end: false },
  { to: "/export", label: "Export", icon: DownloadIcon, end: false },
];

/**
 * Two navigations for two postures, rather than one stretched to cover both.
 *
 * On a phone the app is thumb-driven, so the tabs sit at the bottom within reach. From
 * tablet width up that same bar would be a short strip marooned in the middle of a wide
 * screen, so the nav becomes a persistent left rail instead, which also finds room for
 * the shop name and a real sign-out control, both of which are screen-reader-only on
 * mobile because there is nowhere to put them.
 *
 * The switch is at md rather than lg so an iPad in portrait gets the rail. Multi-column
 * page layouts wait for lg, where there is width for two columns beside the rail.
 */
export function AppShell() {
  const { business, email, signOut } = useAuth();

  return (
    <div className="min-h-dvh bg-paper md:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-sm
          focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <Sidebar business={business?.name} email={email} onSignOut={signOut} />

      {/* min-w-0 keeps a wide table or a long note from forcing the flex row wider than
          the viewport instead of scrolling inside its own column. */}
      <div className="min-w-0 flex-1">
        <SubscriptionBanner />
        <MobileHeader business={business?.name} />
        {/* Full width by design. Measure and padding belong to Page, so there is one
            place to change them rather than a shell cap and five page caps that have to
            be kept in agreement by hand. */}
        <main id="main" className="pb-20 md:pb-12">
          <Outlet />
        </main>
      </div>

      <MobileTabs />
    </div>
  );
}

/**
 * The phone's only chrome above the content: the shop name, and the way into Settings.
 * Hidden from tablet up, where the rail already carries both.
 */
function MobileHeader({ business }: { business: string | undefined }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 md:hidden">
      <span className="truncate text-sm font-medium text-mute">
        {business ?? "Glaux Ledger"}
      </span>
      <NavLink
        to="/settings"
        aria-label="Settings"
        className={({ isActive }) =>
          `-mr-2 flex size-9 items-center justify-center rounded-sm transition-colors ${
            isActive ? "text-accent" : "text-mute"
          }`
        }
      >
        <SettingsIcon />
      </NavLink>
    </div>
  );
}

function Sidebar({
  business,
  email,
  onSignOut,
}: {
  business: string | undefined;
  email: string | null;
  onSignOut: () => void;
}) {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line
        bg-card px-4 py-6 md:flex lg:w-60"
    >
      <div className="px-2">
        {/* Signed in, home is the entry screen rather than the marketing page. The
            wordmark is the one control everybody tries first when they want to get
            back to the start, so it should not be the only dead text on the rail. */}
        <Link to="/" className="font-display text-xl tracking-tight">
          Glaux Ledger
        </Link>
        {business && (
          <p className="mt-0.5 truncate text-xs text-mute">{business}</p>
        )}
      </div>

      <ul className="mt-8 flex flex-col gap-1">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium
                 transition-colors ${
                   isActive
                     ? "bg-accent-wash text-accent"
                     : "text-mute hover:bg-sunk hover:text-ink"
                 }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon active={isActive} />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="mt-auto border-t border-line pt-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium
             transition-colors ${
               isActive
                 ? "bg-accent-wash text-accent"
                 : "text-mute hover:bg-sunk hover:text-ink"
             }`
          }
        >
          <SettingsIcon />
          <span>Settings</span>
        </NavLink>

        <div className="px-3 pt-3">
          {email && <p className="truncate text-xs text-mute">{email}</p>}
          <button
            type="button"
            onClick={onSignOut}
            className="mt-2 text-sm font-medium text-mute transition-colors hover:text-expense"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

function MobileTabs() {
  return (
    <nav
      aria-label="Main"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md
        border-t border-line bg-card/95 pt-1 backdrop-blur md:hidden"
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 rounded-sm py-2 text-xs font-medium
             transition-colors ${isActive ? "text-accent" : "text-mute"}`
          }
        >
          {({ isActive }) => (
            <>
              <Icon active={isActive} />
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

interface IconProps {
  active?: boolean;
}

function PlusIcon({ active }: IconProps) {
  return (
    <Svg active={active}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

function ChartIcon({ active }: IconProps) {
  return (
    <Svg active={active}>
      <path d="M4 19V10M10 19V5M16 19v-6M22 19H2" />
    </Svg>
  );
}

function ListIcon({ active }: IconProps) {
  return (
    <Svg active={active}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Svg>
  );
}

function DownloadIcon({ active }: IconProps) {
  return (
    <Svg active={active}>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
    </Svg>
  );
}

// Sliders rather than a cog. A cog at 18px on a light ground loses its teeth and
// reads as a sun, which suggests a brightness control.
function SettingsIcon() {
  return (
    <Svg>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </Svg>
  );
}

function Svg({
  active,
  children,
}: {
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.4 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 md:size-[18px]"
    >
      {children}
    </svg>
  );
}
