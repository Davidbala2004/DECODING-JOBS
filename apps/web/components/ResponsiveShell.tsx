"use client";

import { X } from "lucide-react";

import { useMapSelectionStore } from "@/lib/store";
import { MapWorkspace } from "./MapWorkspace";
import { CompanySidePanel } from "./CompanySidePanel";

/**
 * The map is full-bleed at all times — the company panel only exists when
 * something is selected, sliding in over the map (desktop) or up from the
 * bottom (mobile) rather than permanently reserving a quarter of the screen
 * for an empty "select a company" placeholder.
 */
export function ResponsiveShell() {
  const selectedCompanyId = useMapSelectionStore((s) => s.selectedCompanyId);
  const setSelectedCompanyId = useMapSelectionStore((s) => s.setSelectedCompanyId);
  const isOpen = selectedCompanyId !== null;

  return (
    <main className="relative flex min-h-0 flex-1 overflow-hidden">
      <style jsx global>{`
        @keyframes sheetSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes panelSlideIn {
          from { transform: translateX(100%); opacity: 0.6; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* The map always fills the whole workspace. */}
      <section className="h-full w-full">
        <MapWorkspace />
      </section>

      {/* Desktop: floating panel, only when a company is selected. */}
      {isOpen && (
        <div
          className="absolute bottom-3 right-3 top-3 z-30 hidden w-[380px] overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl lg:block"
          style={{ animation: "panelSlideIn 0.28s cubic-bezier(0.32,0.72,0,1)" }}
        >
          <button
            type="button"
            onClick={() => setSelectedCompanyId(null)}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-gray-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <CompanySidePanel />
        </div>
      )}

      {/* Mobile / tablet: bottom-sheet overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            style={{ animation: "backdropFadeIn 0.2s ease-out" }}
            onClick={() => setSelectedCompanyId(null)}
          />
          <div
            className="absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            style={{ animation: "sheetSlideUp 0.25s cubic-bezier(0.32,0.72,0,1)" }}
          >
            <div className="relative flex shrink-0 items-center justify-center py-2.5">
              <div className="h-1 w-10 rounded-full bg-gray-200" />
              <button
                type="button"
                onClick={() => setSelectedCompanyId(null)}
                aria-label="Close"
                className="absolute right-3 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <CompanySidePanel />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
