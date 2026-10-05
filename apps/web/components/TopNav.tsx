"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ListChecks,
  Radio,
  Rocket,
  UserCog,
  Users2,
  Building2,
  ChevronDown,
  LogOut,
  ShieldOff,
  UserRound,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { FeedbackButton } from "@/components/FeedbackButton";
import { useIdentityStore } from "@/lib/identityStore";
import { useLiveUpdatesStore } from "@/lib/liveUpdatesStore";
import { getApplicationBoard, logout, logoutAllSessions } from "@/lib/api";

const LIVE_POLL_INTERVAL_MS = 15_000;

function NavLink({
  href,
  icon: Icon,
  label,
  badge,
  active,
  hideBelowSm = false,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  active: boolean;
  hideBelowSm?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all sm:px-3",
        // The bar is tuned to fit a 360px header exactly; anything added here
        // at the base breakpoint overflows it. `hideBelowSm` retires a link on
        // phones when the same destination is already reachable elsewhere.
        hideBelowSm ? "hidden sm:flex" : "flex",
        active ? "text-green-700" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
      )}
    >
      {active && (
        <span className="absolute inset-0 rounded-lg bg-green-50" style={{ animation: "navActiveFadeIn 0.2s ease-out" }} />
      )}
      <Icon className="relative h-4 w-4" />
      <span className="relative hidden sm:inline">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="relative rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-bold text-green-700">
          {badge}
        </span>
      )}
      {active && (
        <span className="absolute inset-x-2.5 -bottom-[9px] h-0.5 rounded-full bg-green-500 sm:inset-x-3" />
      )}
    </Link>
  );
}

// Its own component (not routed through NavLink's generic `icon` prop) because
// the mark carries its own active treatment — a heavier stroke and a slow
// pulse — rather than NavLink's flat colour swap.
function AiAssistantLink({ active }: { active: boolean }) {
  return (
    <Link
      href="/assistant"
      className={cn(
        "relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all sm:px-3",
        active ? "text-green-700" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
      )}
    >
      {active && (
        <span className="absolute inset-0 rounded-lg bg-green-50" style={{ animation: "navActiveFadeIn 0.2s ease-out" }} />
      )}
      {/* Lucide's sparkle — the standard "AI" glyph, so the nav reads as one
          icon family instead of a bespoke mark. Keeps the live/thinking pulse
          only while the assistant is the current page, where it means
          something; as a static glyph it would just be noise. */}
      <Sparkles
        className={cn("relative h-[18px] w-[18px]", active && "animate-pulse")}
        strokeWidth={active ? 2.2 : 1.9}
        aria-hidden="true"
      />
      <span className="relative hidden sm:inline">AI Assistant</span>
      {active && (
        <span className="absolute inset-x-2.5 -bottom-[9px] h-0.5 rounded-full bg-green-500 sm:inset-x-3" />
      )}
    </Link>
  );
}

// "List your startup" and "For Recruiters" are company-side tools, not
// job-seeker features — grouped under one menu so the top-level bar
// doesn't grow by one item every time a company-side feature ships.
function ForCompaniesMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all sm:px-3",
          active || open ? "text-green-700 bg-green-50" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
        )}
      >
        <Building2 className="h-4 w-4" />
        <span className="hidden sm:inline">For Companies</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-green-100 bg-white shadow-[0_6px_20px_rgba(22,163,74,0.16)]"
          style={{ animation: "fadeSlideUp 0.15s ease-out" }}
        >
          <Link
            href="/register"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-green-50 hover:text-green-700"
          >
            <Rocket className="h-4 w-4 shrink-0 text-green-700" />
            <div>
              <p className="font-semibold">List your startup</p>
              <p className="text-xs text-gray-500">Get a pin on the map, start hiring</p>
            </div>
          </Link>
          <div className="h-px bg-green-50" />
          <Link
            href="/recruiters"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-green-50 hover:text-green-700"
          >
            <Users2 className="h-4 w-4 shrink-0 text-green-700" />
            <div>
              <p className="font-semibold">For Recruiters</p>
              <p className="text-xs text-gray-500">Search and unlock candidate profiles</p>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}

// Account menu. Before this existed there was no way to sign out at all —
// which made the "sign in with a different address" instruction on /register
// impossible to follow, and left a bearer token live on a shared machine
// forever. Deliberately last in the bar: that's where people look for it.
function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const email = useIdentityStore((s) => s.email);
  const clearIdentity = useIdentityStore((s) => s.clearIdentity);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function signOut(everywhere: boolean) {
    setBusy(true);
    try {
      await (everywhere ? logoutAllSessions() : logout());
    } catch {
      // Swallowed on purpose: the user asked to sign out, so a failed network
      // call must not leave them stuck signed in. Local identity is cleared
      // below regardless — the token stays server-side but is forgotten here.
    }
    clearIdentity();
    // Without this, the next person on this machine sees the previous user's
    // tracker board and preferences rendered from the in-memory cache.
    queryClient.clear();
    setBusy(false);
    setOpen(false);
    router.push("/");
  }

  // Signed out — a plain way back in, rather than making people find /tracker.
  if (!email) {
    return (
      <Link
        href="/tracker"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-all hover:bg-green-50 hover:text-green-700 sm:px-3"
      >
        <UserRound className="h-4 w-4" />
        <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu — signed in as ${email}`}
        className={cn(
          "relative flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium transition-all sm:px-2.5",
          open ? "bg-green-50 text-green-700" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-xs font-bold uppercase text-white">
          {email.slice(0, 1)}
        </span>
        <ChevronDown className={cn("hidden h-3 w-3 transition-transform sm:block", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-green-100 bg-white shadow-[0_6px_20px_rgba(22,163,74,0.16)]"
          style={{ animation: "fadeSlideUp 0.15s ease-out" }}
        >
          <div className="border-b border-green-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Signed in as</p>
            <p className="truncate text-sm font-semibold text-gray-900" title={email}>
              {email}
            </p>
          </div>
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-green-50 hover:text-green-700"
          >
            <UserCog className="h-4 w-4 shrink-0 text-green-700" />
            Preferences
          </Link>
          <div className="h-px bg-green-50" />
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => signOut(false)}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-green-50 hover:text-green-700 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 shrink-0 text-green-700" />
            Sign out
          </button>
          <div className="h-px bg-green-50" />
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => signOut(true)}
            title="Also ends sessions on your other devices"
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-green-50 hover:text-green-700 disabled:opacity-50"
          >
            <ShieldOff className="h-4 w-4 shrink-0 text-green-700" />
            Sign out everywhere
          </button>
        </div>
      )}
    </div>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const email = useIdentityStore((s) => s.email);
  const liveUpdatesEnabled = useLiveUpdatesStore((s) => s.enabled);
  const toggleLiveUpdates = useLiveUpdatesStore((s) => s.toggle);

  const { data: board } = useQuery({
    queryKey: ["applicationBoard", email],
    queryFn: () => getApplicationBoard(),
    enabled: !!email,
    // Only poll while the tracker is actually on screen — the badge doesn't
    // need 15s freshness on the map, and a global poll is wasted load.
    refetchInterval: liveUpdatesEnabled && pathname === "/tracker" ? LIVE_POLL_INTERVAL_MS : false,
  });

  return (
    <header
      className="relative flex h-14 shrink-0 items-center border-b border-green-100 px-3 sm:px-6"
      style={{ background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)" }}
    >
      <style jsx global>{`
        @keyframes navActiveFadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Logo / Brand — doubles as the home/map link */}
      {/* Tighter margins at the base breakpoint: icon-only labels plus two
          separators and a toggle overflow a 360px header by ~9px otherwise. */}
      <Link href="/" className="flex items-center gap-2 mr-2 shrink-0 sm:gap-2.5 sm:mr-8">
        {/* Brand mark — deliberately NOT a MapPin. The pin glyph is the city
            filter and the location rows; reusing it here made the product's
            own logo read as "a place". A DJ monogram is unmistakably the mark. */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-600 shadow-md shadow-green-500/20 transition-transform hover:scale-105">
          <span className="text-xs font-black leading-none tracking-tight text-white">DJ</span>
        </div>
        <span className="hidden text-sm font-bold tracking-tight text-gray-900 sm:inline">
          DECODING<span className="text-green-700">JOBS</span>
        </span>
      </Link>

      <div className="flex items-center gap-0.5 ml-auto sm:gap-1">
        <AiAssistantLink active={pathname === "/assistant"} />

        <NavLink
          href="/tracker"
          icon={ListChecks}
          label="App Tracker"
          badge={board?.length}
          active={pathname === "/tracker"}
        />

        {/* Preferences is duplicated in the account menu below, so it yields
            its slot on phones to the Feedback entry point without making
            anything unreachable on mobile. */}
        <NavLink
          href="/profile"
          icon={UserCog}
          label="Preferences"
          active={pathname === "/profile"}
          hideBelowSm
        />

        <FeedbackButton />

        <div className="mx-1 h-5 w-px bg-gray-200 sm:mx-2" />

        <ForCompaniesMenu active={pathname === "/register" || pathname === "/recruiters"} />

        <div className="mx-1 h-5 w-px bg-gray-200 sm:mx-2" />

        <div className="flex items-center gap-1.5 pl-1" title={liveUpdatesEnabled ? "Live updates on — polling every 15s" : "Live updates off"}>
          <Radio className={cn("hidden h-3.5 w-3.5 transition-colors sm:block", liveUpdatesEnabled ? "text-green-700" : "text-gray-500")} />
          <Switch
            checked={liveUpdatesEnabled}
            onCheckedChange={toggleLiveUpdates}
            aria-label="Toggle live tracker updates"
          />
        </div>

        <div className="mx-1 h-5 w-px bg-gray-200 sm:mx-2" />

        <AccountMenu />
      </div>
    </header>
  );
}
