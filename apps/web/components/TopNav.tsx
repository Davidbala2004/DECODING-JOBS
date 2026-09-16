"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ListChecks, MapPin, Radio, Rocket, UserCog, Users2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useIdentityStore } from "@/lib/identityStore";
import { useLiveUpdatesStore } from "@/lib/liveUpdatesStore";
import { getApplicationBoard } from "@/lib/api";

const LIVE_POLL_INTERVAL_MS = 15_000;

function NavLink({
  href,
  icon: Icon,
  label,
  badge,
  active,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all sm:px-3",
        active ? "text-green-700" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
      )}
    >
      {active && (
        <span className="absolute inset-0 rounded-lg bg-green-50" style={{ animation: "navActiveFadeIn 0.2s ease-out" }} />
      )}
      <Icon className="relative h-4 w-4" />
      <span className="relative hidden sm:inline">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="relative rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
          {badge}
        </span>
      )}
      {active && (
        <span className="absolute inset-x-2.5 -bottom-[9px] h-0.5 rounded-full bg-green-500 sm:inset-x-3" />
      )}
    </Link>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const email = useIdentityStore((s) => s.email);
  const liveUpdatesEnabled = useLiveUpdatesStore((s) => s.enabled);
  const toggleLiveUpdates = useLiveUpdatesStore((s) => s.toggle);

  const { data: board } = useQuery({
    queryKey: ["applicationBoard", email],
    queryFn: () => getApplicationBoard(email as string),
    enabled: !!email,
    refetchInterval: liveUpdatesEnabled ? LIVE_POLL_INTERVAL_MS : false,
  });

  return (
    <header
      className="relative flex h-14 shrink-0 items-center border-b border-emerald-100 px-3 sm:px-6"
      style={{ background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)" }}
    >
      <style jsx global>{`
        @keyframes navActiveFadeIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Logo / Brand — doubles as the home/map link */}
      <Link href="/" className="flex items-center gap-2 mr-4 shrink-0 sm:gap-2.5 sm:mr-8">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 shadow-md shadow-green-500/20 transition-transform hover:scale-105">
          <MapPin className="h-4 w-4 text-white" />
        </div>
        <span className="hidden text-sm font-bold tracking-tight text-gray-900 sm:inline">
          DECODING<span className="text-green-600">JOBS</span>
        </span>
      </Link>

      <div className="flex items-center gap-1 ml-auto">
        <NavLink href="/register" icon={Rocket} label="List your startup" active={pathname === "/register"} />

        <div className="mx-1 h-5 w-px bg-gray-200 sm:mx-2" />

        <NavLink href="/recruiters" icon={Users2} label="For Recruiters" active={pathname === "/recruiters"} />

        <div className="mx-1 h-5 w-px bg-gray-200 sm:mx-2" />

        <NavLink href="/assistant" icon={Sparkles} label="AI Assistant" active={pathname === "/assistant"} />

        <div className="mx-1 h-5 w-px bg-gray-200 sm:mx-2" />

        <NavLink
          href="/tracker"
          icon={ListChecks}
          label="App Tracker"
          badge={board?.length}
          active={pathname === "/tracker"}
        />

        <div className="mx-1 h-5 w-px bg-gray-200 sm:mx-2" />

        <NavLink href="/profile" icon={UserCog} label="Preferences" active={pathname === "/profile"} />

        <div className="mx-1 h-5 w-px bg-gray-200 sm:mx-2" />

        <div className="flex items-center gap-1.5 pl-1" title={liveUpdatesEnabled ? "Live updates on — polling every 15s" : "Live updates off"}>
          <Radio className={cn("hidden h-3.5 w-3.5 transition-colors sm:block", liveUpdatesEnabled ? "text-green-500" : "text-gray-300")} />
          <Switch
            checked={liveUpdatesEnabled}
            onCheckedChange={toggleLiveUpdates}
            aria-label="Toggle live tracker updates"
          />
        </div>
      </div>
    </header>
  );
}
