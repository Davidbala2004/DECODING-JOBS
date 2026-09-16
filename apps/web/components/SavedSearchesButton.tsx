"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, Bell, BellOff, Loader2, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useIdentityStore } from "@/lib/identityStore";
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  type SavedSearchFilters,
} from "@/lib/api";

export function SavedSearchesButton({
  filters,
  onApply,
  grouped,
}: {
  filters: SavedSearchFilters;
  onApply: (filters: SavedSearchFilters) => void;
  /** True when nested inside another pill/card (e.g. the map toolbar's
   * shared Tools group) — drops its own shadow/background so it doesn't
   * look like a second floating button stacked on top of the group. */
  grouped?: boolean;
}) {
  const email = useIdentityStore((s) => s.email);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: savedSearches, isLoading } = useQuery({
    queryKey: ["savedSearches", email],
    queryFn: () => listSavedSearches(email as string),
    enabled: !!email && open,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createSavedSearch({ email: email as string, label: label.trim(), filters, emailAlertsEnabled: alertsEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["savedSearches", email] });
      setLabel("");
      setAlertsEnabled(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSavedSearch({ id, email: email as string }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["savedSearches", email] }),
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined && v !== "" && v !== false).length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 text-sm font-semibold transition-all duration-200",
          grouped ? "rounded-lg px-3 py-1.5" : "rounded-xl px-3.5 py-2 shadow-lg",
          open
            ? cn("bg-gradient-to-r from-green-500 to-emerald-600 text-white", !grouped && "shadow-green-500/25")
            : cn("text-gray-600 hover:bg-green-50 hover:text-green-700", !grouped && "bg-white")
        )}
      >
        <Bookmark className="h-4 w-4" />
        <span className="hidden sm:inline">Saved</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.15)]"
          style={{ animation: "fadeSlideUp 0.2s ease-out" }}
        >
          <div className="flex items-center gap-2 border-b border-green-50 px-4 py-3">
            <Bookmark className="h-3.5 w-3.5 text-green-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Saved searches</h3>
            <button type="button" onClick={() => setOpen(false)} className="ml-auto rounded-full p-1 text-gray-400 hover:bg-gray-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {!email ? (
            <div className="p-4 text-center text-xs text-gray-500">
              <Link href="/profile" className="font-semibold text-green-600 hover:underline">
                Sign in
              </Link>{" "}
              to save searches and get email alerts for new matching jobs.
            </div>
          ) : (
            <>
              <div className="border-b border-gray-50 p-3">
                <Input
                  placeholder={`Name this search${activeFilterCount ? ` (${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"})` : ""}`}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="h-9 text-xs"
                />
                <div className="mt-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setAlertsEnabled((v) => !v)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-semibold transition-colors",
                      alertsEnabled ? "bg-green-50 text-green-700" : "text-gray-400 hover:text-gray-600"
                    )}
                  >
                    {alertsEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                    Email alerts
                  </button>
                  <button
                    type="button"
                    disabled={!label.trim() || createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                    className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-3 py-1.5 text-[12.5px] font-bold text-white shadow-sm disabled:opacity-40"
                  >
                    {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookmarkCheck className="h-3 w-3" />}
                    Save
                  </button>
                </div>
              </div>

              <div className="scroll-thin max-h-56 overflow-y-auto p-2">
                {isLoading && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-green-500" />
                  </div>
                )}
                {!isLoading && (!savedSearches || savedSearches.length === 0) && (
                  <p className="px-2 py-3 text-center text-[12.5px] text-gray-400">No saved searches yet.</p>
                )}
                {savedSearches?.map((s) => (
                  <div
                    key={s.id}
                    className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-green-50/60"
                  >
                    <button
                      type="button"
                      onClick={() => { onApply(s.filters); setOpen(false); }}
                      className="flex flex-1 items-center gap-1.5 text-left text-xs font-medium text-gray-700"
                    >
                      {s.email_alerts_enabled && <Bell className="h-3 w-3 shrink-0 text-green-500" />}
                      <span className="truncate">{s.label}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(s.id)}
                      className="shrink-0 rounded-md p-1 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
