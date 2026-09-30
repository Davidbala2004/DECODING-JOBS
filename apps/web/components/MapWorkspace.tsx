"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map, Marker, Popup, type MapRef } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster, { type ClusterFeature, type PointFeature } from "supercluster";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Minus,
  Compass,
  Loader2,
  AlertTriangle,
  Briefcase,
  MapPin,
  X,
  Building2,
  TrendingUp,
  Rocket,
  Landmark,
  Sprout,
  CircleDollarSign,
  Building,
  Factory,
  Blocks,
  MapPinned,
  Filter,
  BriefcaseBusiness,
  ChevronDown,
  Layers,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { SavedSearchesButton } from "@/components/SavedSearchesButton";
import { useIdentityStore } from "@/lib/identityStore";
import type { SavedSearchFilters } from "@/lib/api";
import {
  searchCompaniesInBoundingBox,
  searchJobs,
  getJobSuggestions,
  getPreferences,
  getSectors,
  getCities,
  getStages,
  getAreas,
  getTypes,
  getDepartments,
  type BoundingBox,
  type Company,
} from "@/lib/api";
import { useMapSelectionStore } from "@/lib/store";

// ---------------------------------------------------------------------------
// Sector → visual config
// ---------------------------------------------------------------------------

const SECTOR_CONFIG: Record<string, { color: string; emoji: string }> = {
  AI: { color: "#3B82F6", emoji: "🤖" },
  SaaS: { color: "#10B981", emoji: "☁️" },
  Fintech: { color: "#F97316", emoji: "💳" },
  Consumer: { color: "#EC4899", emoji: "🛍️" },
  Healthtech: { color: "#EF4444", emoji: "🏥" },
  Edtech: { color: "#EAB308", emoji: "📚" },
  "Cloud/Infra": { color: "#06B6D4", emoji: "🌐" },
  Mobile: { color: "#8B5CF6", emoji: "📱" },
  Deeptech: { color: "#6366F1", emoji: "🔬" },
  Other: { color: "#6B7280", emoji: "🏢" },
};

const DEFAULT_SECTOR = { color: "#6B7280", emoji: "🏢" };
function getSectorConfig(sector: string | null) {
  const key = sector || "Other";
  return (SECTOR_CONFIG as Record<string, { color: string; emoji: string }>)[key] ?? DEFAULT_SECTOR;
}

// Resolve a company's logo through the local `/api/logo` proxy — shared by
// the map pin, the grid card, and the toolbar's job-search result rows.
function resolveLogoUrl(company: Pick<Company, "website_url" | "logo_url">): string | null {
  const websiteDomain = company.website_url
    ? (() => {
        try { return new URL(company.website_url).hostname; }
        catch {
          const url = company.website_url.replace(/^[/]+/, "").split(/[/s?#]/)[0];
          return url && url.includes(".") ? url : null;
        }
      })()
    : null;
  const domain =
    websiteDomain ||
    (company.logo_url?.includes("domain=")
      ? (() => { try { return new URL(company.logo_url!).searchParams.get("domain"); } catch { return null; } })()
      : null);
  return domain ? `/api/logo?domain=${domain}` : null;
}

function getInitials(name: string): string {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// City config
// ---------------------------------------------------------------------------

interface CityConfig {
  longitude: number;
  latitude: number;
  zoom: number;
}

const CITY_CENTERS: Record<string, CityConfig> = {
  Bengaluru: { longitude: 77.665, latitude: 12.935, zoom: 11 },
  Chennai: { longitude: 80.255, latitude: 12.98, zoom: 11 },
  Hyderabad: { longitude: 78.4867, latitude: 17.385, zoom: 11 },
  Kochi: { longitude: 76.267, latitude: 9.9312, zoom: 12 },
  Coimbatore: { longitude: 76.97, latitude: 11.01, zoom: 12 },
  Thiruvananthapuram: { longitude: 76.9366, latitude: 8.5241, zoom: 12 },
  Madurai: { longitude: 78.1198, latitude: 9.9252, zoom: 13 },
  Kozhikode: { longitude: 75.7873, latitude: 11.2588, zoom: 13 },
  Visakhapatnam: { longitude: 83.2185, latitude: 17.6868, zoom: 12 },
  Mysuru: { longitude: 76.6394, latitude: 12.2958, zoom: 12 },
  Mumbai: { longitude: 72.8777, latitude: 19.076, zoom: 11 },
  Pune: { longitude: 73.8567, latitude: 18.5204, zoom: 11 },
  "Delhi NCR": { longitude: 77.0266, latitude: 28.4595, zoom: 10 },
  Kolkata: { longitude: 88.3639, latitude: 22.5726, zoom: 11 },
  Ahmedabad: { longitude: 72.5714, latitude: 23.0225, zoom: 11 },
};

function getCityCenter(city: string): CityConfig {
  return (CITY_CENTERS as Record<string, CityConfig>)[city] ?? CITY_CENTERS["Bengaluru"]!;
}

const MAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

// ---------------------------------------------------------------------------
// Company Pin — the fancy avatar with logo, hiring glow, and rich tooltip
// ---------------------------------------------------------------------------

const CompanyPin = React.memo(function CompanyPin({
  company,
  isSelected,
  isHovered,
  zoom,
  onClick,
  onHover,
  onLeave,
}: {
  company: Company;
  isSelected: boolean;
  isHovered: boolean;
  zoom: number;
  onClick: () => void;
  onHover: () => void;
  onLeave: () => void;
}) {
  const isHiring = company.active_job_count > 0;
  const sector = getSectorConfig(company.sector) ?? DEFAULT_SECTOR;

  // Resolve logo URL via local proxy (computed once)
  const logoUrl = useMemo(
    () => resolveLogoUrl({ website_url: company.website_url, logo_url: company.logo_url }),
    [company.website_url, company.logo_url]
  );

  // Dynamic sizing based on zoom level (snapped to avoid micro-jitter)
  const PIN_SIZE = useMemo(() => {
    const zoomScale = Math.min(Math.max((zoom - 10) / 4, 0), 1);
    const baseSize = 32 + zoomScale * 20;
    const base = isSelected ? baseSize + 16 : isHovered ? baseSize + 8 : baseSize;
    // A company with zero active jobs renders smaller — "worth a click?" is
    // visible before the click, not just after, instead of every pin on the
    // map looking equally promising regardless of whether it's hiring.
    return isHiring || isSelected || isHovered ? base : base * 0.8;
  }, [zoom, isSelected, isHovered, isHiring]);

  return (
    <div
      className="flex flex-col items-center"
      style={{
        zIndex: isSelected ? 200 : isHovered ? 100 : 10,
        cursor: "pointer",
        opacity: isHiring || isSelected || isHovered ? 1 : 0.55,
        filter: isSelected
          ? "drop-shadow(0 4px 12px rgba(0,0,0,0.25))"
          : "drop-shadow(0 2px 6px rgba(0,0,0,0.15))",
        transition: "opacity 0.2s ease",
      }}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* ── Floating name pill (selected) ── */}
      {isSelected && (
        <div
          className="mb-2 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[12.5px] font-bold text-white z-50"
          style={{
            background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          {isHiring && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[8px]">
              <Briefcase className="h-2.5 w-2.5 text-white" />
            </span>
          )}
          {company.name}
          {isHiring && <span className="text-green-400">· {company.active_job_count} open</span>}
        </div>
      )}

      {/* ── Main avatar ── */}
      <div className="relative">
        {/* Hiring: animated pulse ring */}
        {isHiring && (
          <>
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: "2px solid #22c55e",
                animation: "ping 1.8s cubic-bezier(0,0,0.2,1) infinite",
                opacity: 0.4,
                margin: "-6px",
              }}
            />
            <div
              className="absolute inset-0 rounded-full"
              style={{
                border: "2px solid #22c55e",
                animation: "ping 1.8s cubic-bezier(0,0,0.2,1) infinite 0.6s",
                opacity: 0.25,
                margin: "-6px",
              }}
            />
          </>
        )}

        {/* Outer ring */}
        <div
          className="rounded-full transition-all duration-[400ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{
            width: PIN_SIZE,
            height: PIN_SIZE,
            padding: 3,
            background: isHiring
              ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)"
              : `linear-gradient(135deg, ${sector.color}66 0%, ${sector.color}33 100%)`,
            boxShadow: isHiring
              ? "0 0 0 2px rgba(34,197,94,0.3), 0 4px 12px rgba(34,197,94,0.2)"
              : `0 0 0 1px ${sector.color}22, 0 2px 8px rgba(0,0,0,0.1)`,
            transform: isSelected ? "scale(1.2)" : isHovered ? "scale(1.08)" : "scale(1)",
          }}
        >
          {/* Inner white circle with logo */}
          <div
            className="flex h-full w-full items-center justify-center rounded-full bg-white overflow-hidden"
            style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06)" }}
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={company.name}
                className="h-[72%] w-[72%] object-contain"
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  // Hide the broken image, CSS fallback shows initials
                  (e.target as HTMLImageElement).style.display = "none";
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    const span = parent.querySelector(".logo-fallback");
                    if (span) (span as HTMLElement).style.display = "flex";
                  }
                }}
                draggable={false}
              />
            ) : null}
            {/* Logo fallback — always rendered but hidden when logo loads */}
            <span
              className="logo-fallback font-extrabold leading-none select-none"
              style={{
                fontSize: PIN_SIZE * 0.28,
                color: sector.color,
                display: logoUrl ? "none" : "flex",
                position: logoUrl ? "absolute" : "relative",
              }}
            >
              {getInitials(company.name)}
            </span>
          </div>
        </div>

        {/* Hiring badge */}
        {isHiring && (
          <div
            className="absolute flex items-center justify-center rounded-full bg-green-500 text-white shadow-md"
            style={{ width: 20, height: 20, bottom: -2, right: -4, border: "2.5px solid white" }}
          >
            <Briefcase className="h-2.5 w-2.5" />
          </div>
        )}

        {/* "NEW" flash — a role went live in the last few days. Distinct
            fast blink vs. the slow standing pulse every hiring pin gets,
            so a freshly-opened role is visually obvious at a glance. */}
        {company.recently_hiring && (
          <div
            className="absolute flex items-center justify-center rounded-full bg-lime-400 px-1.5 py-0.5 text-[8px] font-extrabold text-emerald-950 shadow-md"
            style={{ top: -8, left: "50%", transform: "translateX(-50%)", animation: "newFlash 1.1s ease-in-out infinite", border: "1.5px solid white" }}
          >
            NEW
          </div>
        )}

        {/* Non-hiring dot */}
        {!isHiring && (
          <div
            className="absolute rounded-full bg-gray-300"
            style={{ width: 10, height: 10, bottom: 0, right: 0, border: "2px solid white" }}
          />
        )}
      </div>

      {/* ── Hover tooltip ── */}
      {isHovered && !isSelected && (
        <div
          className="absolute whitespace-nowrap rounded-xl px-3.5 py-2.5 text-xs shadow-xl z-50"
          style={{
            top: PIN_SIZE + 8,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(255,255,255,0.95)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-3 w-3" style={{ color: sector.color }} />
            <span className="font-bold text-gray-900">{company.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-gray-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: sector.color }} />
            <span>{company.sector || "Other"}</span>
            {company.area && (
              <>
                <span className="text-gray-300">·</span>
                <span>{company.area}</span>
              </>
            )}
          </div>
          {isHiring ? (
            <div className="mt-1.5 flex items-center gap-1 text-green-600 font-semibold">
              <TrendingUp className="h-3 w-3" />
              {company.active_job_count} open roles
            </div>
          ) : (
            <div className="mt-1.5 text-gray-400">Not hiring right now</div>
          )}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// City-level cluster — a small classic map pin (teardrop), not a card and not
// a number badge. Count/hiring detail lives in a tooltip that only appears on
// hover/select, so the pin itself stays small and simple; the 3D feel comes
// from a glossy rotated-teardrop shape, a floating bob, and a bounce-in drop.
// ---------------------------------------------------------------------------
const CityPin = React.memo(function CityPin({
  cityName, count, hiringCount, isSelected, isHovered, onClick, onHover, onLeave,
}: {
  cityName: string; count: number; hiringCount: number;
  isSelected: boolean; isHovered: boolean;
  onClick: () => void; onHover: () => void; onLeave: () => void;
}) {
  const hasHiring = hiringCount > 0;
  const isActive = isSelected || isHovered;
  const size = isActive ? 34 : 28;

  return (
    <div
      className="relative flex flex-col items-center cursor-pointer"
      style={{ zIndex: isActive ? 200 : 50 }}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Tooltip — city name + counts, shown only on hover/select */}
      {isActive && (
        <div
          className="absolute bottom-full mb-2 flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-bold text-white shadow-lg"
          style={{ background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)", animation: "fadeSlideUp 0.15s ease-out" }}
        >
          {cityName}
          <span className="text-white/60">· {count}</span>
          {hasHiring && <span className="text-green-400">· {hiringCount} hiring</span>}
        </div>
      )}

      <div
        className="relative flex items-center justify-center"
        style={{
          width: size,
          height: size,
          transition: "width 0.25s cubic-bezier(0.34,1.56,0.64,1), height 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          animation: isActive
            ? "pinBounceIn 0.45s cubic-bezier(0.34,1.56,0.64,1)"
            : "pinBounceIn 0.45s cubic-bezier(0.34,1.56,0.64,1), cityFloat 3.2s ease-in-out infinite 0.45s",
        }}
      >
        {/* Hiring pulse — a soft ring breathing outward from the pin head */}
        {hasHiring && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ border: "2px solid #22c55e", animation: "ping 2.2s cubic-bezier(0,0,0.2,1) infinite", opacity: 0.4 }}
          />
        )}

        {/* Teardrop pin — a rounded square rotated 45deg, the classic map-pin trick */}
        <div
          className="absolute inset-0 rounded-[50%_50%_50%_0] transition-transform duration-200"
          style={{
            transform: `rotate(-45deg) scale(${isActive ? 1.1 : 1})`,
            background: hasHiring
              ? "linear-gradient(135deg, #4ade80 0%, #16a34a 55%, #047857 100%)"
              : "linear-gradient(135deg, #94a3b8 0%, #475569 55%, #1e293b 100%)",
            boxShadow: isActive
              ? "0 10px 20px -4px rgba(0,0,0,0.4), 0 0 0 3px rgba(255,255,255,0.85)"
              : "0 6px 14px -4px rgba(0,0,0,0.35)",
          }}
        >
          {/* Glossy highlight, kept upright by counter-rotating */}
          <div
            className="absolute rounded-full"
            style={{
              width: "38%", height: "22%", top: "14%", left: "20%",
              background: "linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 70%)",
              transform: "rotate(45deg)",
            }}
          />
        </div>

        {/* Center dot — a sibling of the teardrop, absolutely centered in the
            square so it stays upright and lands in the pin's round head
            regardless of the teardrop's own rotation. */}
        <div
          className="absolute rounded-full bg-white"
          style={{ width: "36%", height: "36%", top: "20%", left: "32%" }}
        />
      </div>

      {/* Ground shadow — breathes opposite the bob so the pin reads as
          dropped onto the map rather than stuck to it. */}
      <div
        className="rounded-[50%] bg-black/25"
        style={{
          width: size * 0.55, height: size * 0.14, marginTop: -2,
          filter: "blur(2px)",
          animation: "cityShadowBreathe 3.2s ease-in-out infinite 0.45s",
        }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Sub-city cluster pin — a small teardrop marker for a tight group of nearby
// companies at street/neighborhood level. Distinct from CityPin (which is
// deliberately number-free — it's a whole city's aggregate) because a
// cluster here is a "zoom in for detail" affordance, the same role a count
// badge plays on every mainstream clustering map (Google Maps, Mapbox).
// Without this, every company in view renders as its own animated DOM pin
// with no limit — fine at ~100 companies, real jank at the hundreds a wider
// data source (Adzuna, self-registration at scale) can add per city.
// ---------------------------------------------------------------------------
const ClusterPin = React.memo(function ClusterPin({
  count, hiringCount, onClick,
}: {
  count: number; hiringCount: number; onClick: () => void;
}) {
  const hasHiring = hiringCount > 0;
  const size = 30 + Math.min(count, 60) / 60 * 12; // 30–42px, gently scales with size

  return (
    <div className="relative flex flex-col items-center cursor-pointer" onClick={onClick}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size, animation: "pinBounceIn 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}
      >
        {hasHiring && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ border: "2px solid #22c55e", animation: "ping 2.2s cubic-bezier(0,0,0.2,1) infinite", opacity: 0.4 }}
          />
        )}
        <div
          className="absolute inset-0 rounded-[50%_50%_50%_0]"
          style={{
            transform: "rotate(-45deg)",
            background: hasHiring
              ? "linear-gradient(135deg, #4ade80 0%, #16a34a 55%, #047857 100%)"
              : "linear-gradient(135deg, #64748b 0%, #334155 55%, #1e293b 100%)",
            boxShadow: "0 6px 14px -4px rgba(0,0,0,0.35)",
          }}
        />
        <span className="relative font-extrabold text-white" style={{ fontSize: size * 0.34 }}>
          {count}
        </span>
      </div>
      <div
        className="rounded-[50%] bg-black/25"
        style={{ width: size * 0.5, height: size * 0.13, marginTop: -2, filter: "blur(2px)" }}
      />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Small filter-panel helpers — active-filter chip and empty-facet hint.
// ---------------------------------------------------------------------------

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 py-1 pl-2.5 pr-1.5 text-[11.5px] font-bold text-white shadow-sm shadow-green-500/20">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/35"
      >
        <X className="h-2 w-2" />
      </button>
    </span>
  );
}

function EmptyFacetHint({ text }: { text: string }) {
  return <p className="px-2.5 py-1.5 text-[12.5px] text-gray-300">{text}</p>;
}

// ---------------------------------------------------------------------------
// Grid view — a card-per-company layout, the Map's alternate view for
// browsing a whole city's roster at a glance instead of panning around it.
// ---------------------------------------------------------------------------

const CompanyGridCard = React.memo(function CompanyGridCard({
  company,
  isSelected,
  onClick,
}: {
  company: Company;
  isSelected: boolean;
  onClick: () => void;
}) {
  const sector = getSectorConfig(company.sector);
  const isHiring = company.active_job_count > 0;
  const logoUrl = useMemo(
    () => resolveLogoUrl({ website_url: company.website_url, logo_url: company.logo_url }),
    [company.website_url, company.logo_url]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-start gap-2.5 rounded-2xl border bg-white p-3.5 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        isSelected ? "border-green-300 ring-2 ring-green-400/30" : "border-gray-100 hover:border-green-200"
      )}
    >
      <div className="flex w-full items-start gap-2.5">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl border border-gray-100 bg-white object-contain p-1"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[12.5px] font-bold text-white"
            style={{ background: sector.color }}
          >
            {getInitials(company.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold text-gray-900">{company.name}</p>
          <p className="mt-0.5 truncate text-[12px] text-gray-400">
            {company.area ? `${company.area}, ` : ""}{company.city}
          </p>
        </div>
        {company.recently_hiring ? (
          <span
            className="shrink-0 rounded-full bg-lime-400 px-1.5 py-0.5 text-[8px] font-extrabold text-emerald-950"
            style={{ animation: "newFlash 1.1s ease-in-out infinite" }}
            title="New role posted recently"
          >
            NEW
          </span>
        ) : isHiring ? (
          <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-green-500 animate-pulse" title="Hiring now" />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {company.sector && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
            style={{ color: sector.color, background: `${sector.color}18` }}
          >
            {company.sector}
          </span>
        )}
        {company.stage && (
          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-500">
            {company.stage}
          </span>
        )}
        {company.team_size && (
          <span className="text-[9.5px] text-gray-400">{company.team_size}</span>
        )}
      </div>

      {company.description && (
        <p className="line-clamp-2 text-[12px] leading-snug text-gray-400">{company.description}</p>
      )}

      <div className="mt-auto flex w-full items-center justify-between pt-1">
        <span className={cn("text-[12px] font-semibold", isHiring ? "text-green-600" : "text-gray-300")}>
          {isHiring ? `${company.active_job_count} open role${company.active_job_count !== 1 ? "s" : ""}` : "No open roles"}
        </span>
        <span className="flex items-center gap-0.5 text-[12px] font-semibold text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
          View <ChevronDown className="h-3 w-3 -rotate-90" />
        </span>
      </div>
    </button>
  );
});

function CompanyGridView({
  companies,
  selectedCompanyId,
  onSelect,
}: {
  companies: Company[];
  selectedCompanyId: number | null;
  onSelect: (id: number) => void;
}) {
  if (companies.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
        <Building2 className="h-8 w-8 text-gray-200" />
        <p className="text-sm font-medium text-gray-400">No companies match these filters</p>
      </div>
    );
  }
  return (
    <div className="scroll-thin h-full w-full overflow-y-auto pb-6 pt-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-3 px-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {companies.map((company) => (
          <CompanyGridCard
            key={company.id}
            company={company}
            isSelected={company.id === selectedCompanyId}
            onClick={() => onSelect(company.id)}
          />
        ))}
      </div>
    </div>
  );
}

// --- Main Component
export function MapWorkspace() {
  const mapRef = useRef<MapRef>(null);
  const [bbox, setBbox] = useState<BoundingBox | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState("Bengaluru");
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [hiringOnly, setHiringOnly] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const isFirstRender = useRef(true);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [hoveredCity, setHoveredCity] = useState<string | null>(null);
  const [zoom, setZoom] = useState(6);
  const [viewMode, setViewMode] = useState<"map" | "grid">("map");
  // A single click on a cluster shows every company inside it as a pickable
  // list, right there — no repeated click-to-zoom-to-cluster-again cycle to
  // drill down to an individual company.
  const [openClusterId, setOpenClusterId] = useState<number | null>(null);
  const [forYouOnly, setForYouOnly] = useState(false);
  const appliedPreferredCity = useRef(false);

  const selectedCompanyId = useMapSelectionStore((s) => s.selectedCompanyId);
  const setSelectedCompanyId = useMapSelectionStore((s) => s.setSelectedCompanyId);

  const identityEmail = useIdentityStore((s) => s.email);
  const { data: preferences } = useQuery({
    queryKey: ["preferences", identityEmail],
    queryFn: () => getPreferences(),
    enabled: !!identityEmail,
  });

  // Default the city to the signed-in user's top preferred city, once —
  // after that, whatever the user picks in the dropdown wins.
  useEffect(() => {
    if (appliedPreferredCity.current) return;
    if (preferences?.preferred_cities?.[0]) {
      appliedPreferredCity.current = true;
      setSelectedCity(preferences.preferred_cities[0]);
    }
  }, [preferences]);

  // "For You" — highlights companies with a job matching any of the user's
  // target roles, reusing the same per-role job search the map's own search
  // bar uses (jobs/search is a single-phrase ILIKE, so target roles are
  // searched one at a time and merged rather than joined into one query).
  const targetRoles = preferences?.target_roles?.slice(0, 3) ?? [];
  const { data: forYouResults } = useQuery({
    queryKey: ["forYouJobSearch", targetRoles, selectedCity],
    queryFn: async () => {
      const results = await Promise.all(targetRoles.map((role) => searchJobs(role, selectedCity)));
      return results.flat();
    },
    enabled: forYouOnly && targetRoles.length > 0,
  });
  const forYouCompanyIds = useMemo(() => {
    if (!forYouResults) return null;
    return new Set(forYouResults.map((r) => r.company_id));
  }, [forYouResults]);

  const { data: sectors } = useQuery({ queryKey: ["sectors", selectedCity], queryFn: () => getSectors(selectedCity) });
  const { data: cities } = useQuery({ queryKey: ["cities"], queryFn: getCities });
  const { data: stages } = useQuery({ queryKey: ["stages", selectedCity], queryFn: () => getStages(selectedCity) });
  const { data: areas } = useQuery({ queryKey: ["areas", selectedCity], queryFn: () => getAreas(selectedCity) });
  const { data: types } = useQuery({ queryKey: ["types", selectedCity], queryFn: () => getTypes(selectedCity) });
  const { data: departments } = useQuery({ queryKey: ["departments"], queryFn: getDepartments });

  const updateBoundsFromMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    setBbox({
      minLat: bounds.getSouth(),
      minLng: bounds.getWest(),
      maxLat: bounds.getNorth(),
      maxLng: bounds.getEast(),
    });
    setZoom(map.getZoom());
  }, []);

  useEffect(() => {
    const center = getCityCenter(selectedCity);
    setBbox((prev) => {
      if (prev) return prev;
      const d = 0.2;
      return {
        minLat: center.latitude - d,
        minLng: center.longitude - d,
        maxLat: center.latitude + d,
        maxLng: center.longitude + d,
      };
    });
    if (mapRef.current) { updateBoundsFromMap(); return; }
    const id = setInterval(() => { if (mapRef.current) { updateBoundsFromMap(); clearInterval(id); } }, 100);
    return () => clearInterval(id);
  }, [selectedCity, updateBoundsFromMap]);

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const c = getCityCenter(selectedCity);
    mapRef.current?.flyTo({ center: [c.longitude, c.latitude], zoom: c.zoom, duration: 800 });
    // Area values are city-specific ("Koramangala" only exists in Bengaluru) —
    // carrying a stale selection across a city switch silently zeroes results.
    setSelectedArea(null);
  }, [selectedCity]);

  const { data: companies, isLoading, isError } = useQuery({
    queryKey: ["companies", "search", bbox, selectedSector, selectedCity, hiringOnly, selectedStage, selectedArea, selectedType, selectedDepartment],
    queryFn: () =>
      searchCompaniesInBoundingBox(bbox as BoundingBox, {
        sector: selectedSector || undefined,
        city: selectedCity || undefined,
        hiring_only: hiringOnly || undefined,
        stage: selectedStage || undefined,
        area: selectedArea || undefined,
        company_type: selectedType || undefined,
        department: selectedDepartment || undefined,
      }),
    enabled: bbox !== null,
    placeholderData: keepPreviousData,
  });

  // Job search query
  const { data: jobSearchResults } = useQuery({
    queryKey: ["jobSearch", searchQuery, selectedCity],
    queryFn: () => searchJobs(searchQuery, selectedCity),
    enabled: searchQuery.length >= 2,
  });

  // Autocomplete suggestions
  const { data: suggestions } = useQuery({
    queryKey: ["jobSuggestions", searchValue, selectedCity],
    queryFn: () => getJobSuggestions(searchValue, selectedCity),
    enabled: searchValue.length >= 2 && !searchQuery,
  });

  // Debounced search trigger
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearchInput = (val: string) => {
    setSearchValue(val);
    setShowSuggestions(val.length >= 2);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length >= 2) {
      debounceRef.current = setTimeout(() => setSearchQuery(val), 400);
    } else {
      setSearchQuery("");
    }
  };

  const selectSuggestion = (title: string) => {
    setSearchValue(title);
    setSearchQuery(title);
    setShowSuggestions(false);
  };

  const clearSearch = () => {
    setSearchValue("");
    setSearchQuery("");
    setShowSuggestions(false);
  };

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close city dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-city-dropdown]')) setCityDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Active facet filters (Type/Stage/Area/Sector) — city + hiring toggle have
  // their own dedicated controls, so they're not counted as "filters" here.
  const activeFilterCount = [selectedType, selectedStage, selectedArea, selectedSector, selectedDepartment].filter(Boolean).length;
  const clearAllFilters = useCallback(() => {
    setSelectedType(null);
    setSelectedStage(null);
    setSelectedArea(null);
    setSelectedSector(null);
    setSelectedDepartment(null);
  }, []);

  // Current filter combo, shaped to match what a saved search stores/matches
  // against on the backend (see app/api/alerts.py `_matches_filters`).
  const currentFilters: SavedSearchFilters = useMemo(
    () => ({
      city: selectedCity || undefined,
      sector: selectedSector || undefined,
      stage: selectedStage || undefined,
      company_type: selectedType || undefined,
      area: selectedArea || undefined,
      department: selectedDepartment || undefined,
      hiring_only: hiringOnly || undefined,
      q: searchQuery || undefined,
    }),
    [selectedCity, selectedSector, selectedStage, selectedType, selectedArea, selectedDepartment, hiringOnly, searchQuery]
  );

  const applySavedSearch = useCallback((filters: SavedSearchFilters) => {
    if (filters.city) setSelectedCity(filters.city);
    setSelectedSector(filters.sector ?? null);
    setSelectedStage(filters.stage ?? null);
    setSelectedType(filters.company_type ?? null);
    setSelectedArea(filters.area ?? null);
    setSelectedDepartment(filters.department ?? null);
    setHiringOnly(!!filters.hiring_only);
    setSearchValue(filters.q ?? "");
    setSearchQuery(filters.q ?? "");
  }, []);

  // Get company IDs that match job search
  const jobSearchCompanyIds = useMemo(() => {
    if (!jobSearchResults || !searchQuery) return null;
    return new Set(jobSearchResults.map((r) => r.company_id));
  }, [jobSearchResults, searchQuery]);

  // Filter companies — show all when no search, only matching when searching
  // or "For You" is on (matched against the user's saved target roles).
  const filteredCompanies = useMemo(() => {
    if (!companies) return undefined;
    let result = companies;
    if (searchQuery && jobSearchCompanyIds) {
      result = result.filter((c) => jobSearchCompanyIds.has(c.id));
    }
    if (forYouOnly && forYouCompanyIds) {
      result = result.filter((c) => forYouCompanyIds.has(c.id));
    }
    return result;
  }, [companies, searchQuery, jobSearchCompanyIds, forYouOnly, forYouCompanyIds]);

  // Cluster nearby companies at street/neighborhood zoom so a dense area
  // (or a much larger imported dataset) renders as a handful of pins
  // instead of one animated DOM marker per company. maxZoom=16 means once
  // you're zoomed in close, every pin is guaranteed individual again.
  type CompanyClusterProps = { companyId: number; activeJobCount: number };
  const clusterIndex = useMemo(() => {
    const index = new Supercluster<CompanyClusterProps, { hiringCount: number }>({
      radius: 55,
      maxZoom: 16,
      // 4 or fewer nearby companies show as individual pins directly —
      // only a genuinely dense group (5+) collapses into a cluster bubble.
      minPoints: 5,
      map: (props) => ({ hiringCount: props.activeJobCount > 0 ? 1 : 0 }),
      reduce: (acc, props) => { acc.hiringCount += props.hiringCount; },
    });
    const points: PointFeature<CompanyClusterProps>[] = (filteredCompanies ?? []).map((c) => ({
      type: "Feature",
      properties: { companyId: c.id, activeJobCount: c.active_job_count },
      geometry: { type: "Point", coordinates: [c.longitude, c.latitude] },
    }));
    index.load(points);
    return index;
  }, [filteredCompanies]);

  const companiesById = useMemo(
    // globalThis.Map, not the react-map-gl <Map> component imported above.
    () => new globalThis.Map((filteredCompanies ?? []).map((c) => [c.id, c])),
    [filteredCompanies]
  );

  const mapClusters = useMemo(() => {
    if (!bbox) return [];
    return clusterIndex.getClusters(
      [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat],
      Math.round(zoom)
    );
  }, [clusterIndex, bbox, zoom]);

  const hiringCount = filteredCompanies?.filter((c) => c.active_job_count > 0).length ?? 0;
  const totalCount = filteredCompanies?.length ?? 0;
  // City-level data for overview mode (zoomed out)
  const isOverviewMode = zoom < 8;
  const { data: allCities } = useQuery({ queryKey: ["cities"], queryFn: getCities });
  const showCityPins = !filteredCompanies || filteredCompanies.length === 0 || isOverviewMode;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* ── Global CSS ── */}
      <style jsx global>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pinBounceIn {
          0% { transform: scale(0) translateY(10px); opacity: 0; }
          60% { transform: scale(1.1) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes shimmer {
          from { background-position: -200% 0; }
          to { background-position: 200% 0; }
        }
        @keyframes newFlash {
          0%, 100% { opacity: 1; transform: translateX(-50%) scale(1); }
          50% { opacity: 0.55; transform: translateX(-50%) scale(0.92); }
        }
        @keyframes cityFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        @keyframes cityShadowBreathe {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.28; }
          50% { transform: translateX(-50%) scale(0.8); opacity: 0.16; }
        }
        /* Strip MapLibre's default popup chrome (padding/shadow/max-width)
           so the cluster-preview list's own styling shows cleanly instead
           of being double-boxed. */
        .cluster-preview-popup .maplibregl-popup-content {
          padding: 0;
          border-radius: 0.75rem;
          box-shadow: 0 12px 32px -8px rgba(15, 23, 42, 0.25);
          overflow: hidden;
        }
        .cluster-preview-popup .maplibregl-popup-tip {
          border-top-color: white;
        }
      `}</style>

      {viewMode === "grid" && (
        <CompanyGridView
          companies={filteredCompanies ?? []}
          selectedCompanyId={selectedCompanyId}
          onSelect={setSelectedCompanyId}
        />
      )}

      <Map
        ref={mapRef}
        reuseMaps
        style={{ width: "100%", height: "100%", display: viewMode === "map" ? "block" : "none" }}
        initialViewState={{
          longitude: 78.0,
          latitude: 12.0,
          zoom: 6,
        }}
        mapStyle={MAP_STYLE_URL}
        onLoad={updateBoundsFromMap}
        onMoveEnd={updateBoundsFromMap}
        onZoom={() => { if (mapRef.current) setZoom(mapRef.current.getZoom()); }}
        onClick={() => { setSelectedCompanyId(null); setOpenClusterId(null); }}
        attributionControl={false}
      >
        {/* City-level pins (zoomed out) */}
        {showCityPins && allCities?.map((cityInfo) => {
          const center = getCityCenter(cityInfo.city);
          return (
            <Marker
              key={`city-${cityInfo.city}`}
              longitude={center.longitude}
              latitude={center.latitude}
              anchor="center"
            >
              <CityPin
                cityName={cityInfo.city}
                count={cityInfo.count}
                hiringCount={cityInfo.hiring_count}
                isSelected={selectedCity === cityInfo.city}
                isHovered={hoveredCity === cityInfo.city}
                onClick={() => {
                  setSelectedCity(cityInfo.city);
                  mapRef.current?.flyTo({
                    center: [center.longitude, center.latitude],
                    zoom: center.zoom,
                    duration: 1200,
                  });
                }}
                onHover={() => setHoveredCity(cityInfo.city)}
                onLeave={() => setHoveredCity(null)}
              />
            </Marker>
          );
        })}

        {/* Company-level pins (zoomed in) — clustered when several
            companies sit close together, individual pins otherwise. */}
        {!showCityPins && mapClusters.map((feature) => {
          // GeoJSON.Position types as number[] (unknown length) — supercluster
          // always emits exactly [lng, lat] pairs for a Point geometry.
          const [longitude, latitude] = feature.geometry.coordinates as [number, number];

          if ((feature.properties as { cluster?: boolean }).cluster) {
            const clusterFeature = feature as ClusterFeature<{ hiringCount: number }>;
            const clusterId = clusterFeature.properties.cluster_id;
            return (
              <Marker key={`cluster-${clusterId}`} longitude={longitude} latitude={latitude} anchor="bottom">
                <ClusterPin
                  count={clusterFeature.properties.point_count}
                  hiringCount={clusterFeature.properties.hiringCount}
                  onClick={() => setOpenClusterId(clusterId)}
                />
              </Marker>
            );
          }

          const company = companiesById.get((feature.properties as CompanyClusterProps).companyId);
          if (!company) return null;
          return (
            <Marker
              key={company.id}
              longitude={company.longitude}
              latitude={company.latitude}
              anchor="bottom"
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedCompanyId(company.id);
              }}
            >
              <CompanyPin
                company={company}
                isSelected={company.id === selectedCompanyId}
                isHovered={company.id === hoveredId}
                zoom={zoom}
                onClick={() => setSelectedCompanyId(company.id)}
                onHover={() => setHoveredId(company.id)}
                onLeave={() => setHoveredId(null)}
              />
            </Marker>
          );
        })}

        {/* Cluster preview popup — click a cluster once, pick a company
            straight from the list, done. No zoom-click-zoom-click cycle. */}
        {openClusterId !== null && (() => {
          const clusterFeature = mapClusters.find(
            (f) => (f.properties as { cluster?: boolean }).cluster
              && (f as ClusterFeature<{ hiringCount: number }>).properties.cluster_id === openClusterId
          );
          if (!clusterFeature) return null;
          const [lng, lat] = clusterFeature.geometry.coordinates as [number, number];
          const leaves = clusterIndex.getLeaves(openClusterId, 50);
          const totalCount = (clusterFeature as ClusterFeature<{ hiringCount: number }>).properties.point_count;

          return (
            <Popup
              longitude={lng}
              latitude={lat}
              anchor="bottom"
              offset={16}
              closeButton={false}
              onClose={() => setOpenClusterId(null)}
              className="cluster-preview-popup"
            >
              <div className="scroll-thin flex max-h-72 w-64 flex-col overflow-y-auto rounded-xl">
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-3 py-2">
                  <span className="text-[12.5px] font-bold text-gray-800">{totalCount} companies here</span>
                  <button
                    type="button"
                    onClick={() => setOpenClusterId(null)}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <div className="flex flex-col gap-1 p-1.5">
                  {leaves.map((leaf) => {
                    const company = companiesById.get((leaf.properties as CompanyClusterProps).companyId);
                    if (!company) return null;
                    const sector = getSectorConfig(company.sector);
                    return (
                      <button
                        key={company.id}
                        type="button"
                        onClick={() => {
                          setSelectedCompanyId(company.id);
                          setOpenClusterId(null);
                        }}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-green-50"
                      >
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11.5px] font-bold text-white"
                          style={{ background: sector.color }}
                        >
                          {getInitials(company.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-semibold text-gray-800">{company.name}</p>
                          <p className="truncate text-[9.5px] text-gray-400">{company.area ? `${company.area}, ` : ""}{company.city}</p>
                        </div>
                        {company.active_job_count > 0 && (
                          <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                            {company.active_job_count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {totalCount > leaves.length && (
                    <p className="px-2 py-1 text-center text-[11.5px] text-gray-400">
                      +{totalCount - leaves.length} more — zoom in to see all
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          );
        })()}
      </Map>

      {/* ── Top toolbar ── */}
      <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center gap-2">
        {/* Search with autocomplete */}
        <div className="relative min-w-[180px] flex-1 sm:max-w-sm" ref={searchRef}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-400 z-10" />
          <Input
            value={searchValue}
            onChange={(e) => handleSearchInput(e.target.value)}
            onFocus={() => searchValue.length >= 2 && setShowSuggestions(true)}
            placeholder="Search job roles — Frontend Engineer, Data Scientist..."
            className="h-11 rounded-2xl border-gray-100 bg-white/95 pl-9 pr-9 text-sm shadow-[0_2px_12px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-all duration-200 placeholder:text-gray-400 focus:border-green-200 focus:shadow-[0_4px_20px_rgba(34,197,94,0.15)] focus:ring-4 focus:ring-green-400/15"
          />
          {searchValue && (
            <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 z-10">
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions && suggestions.length > 0 && (
            <div
              className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.14)]"
              style={{ animation: "fadeSlideUp 0.15s ease-out" }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => selectSuggestion(s.title)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-green-50"
                >
                  <Search className="h-3.5 w-3.5 shrink-0 text-green-400" />
                  <span className="text-gray-700">{s.title}</span>
                </button>
              ))}
              <div className="border-t border-gray-100 bg-gray-50/50 px-3.5 py-2">
                <span className="text-[11.5px] font-medium text-gray-400">Press Enter to search</span>
              </div>
            </div>
          )}

          {/* Job search results dropdown */}
          {searchQuery && jobSearchResults && jobSearchResults.length > 0 && (
            <div
              className="scroll-thin absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.14)]"
              style={{ animation: "fadeSlideUp 0.15s ease-out" }}
            >
              <div className="sticky top-0 flex items-center gap-1.5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50/50 px-3.5 py-2.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[11.5px] font-bold uppercase tracking-wider text-green-700">{jobSearchResults.length} companies hiring</span>
              </div>
              {jobSearchResults.map((r) => (
                <button
                  key={r.company_id}
                  onClick={() => {
                    setSelectedCompanyId(r.company_id);
                    if (r.latitude && r.longitude) {
                      mapRef.current?.flyTo({ center: [r.longitude, r.latitude], zoom: 13, duration: 600 });
                    }
                    setShowSuggestions(false);
                  }}
                  className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-green-50/70 border-b border-gray-50 last:border-0"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 text-[12.5px] font-bold text-green-700 shadow-sm">
                    {getInitials(r.company_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-gray-900 truncate">{r.company_name}</span>
                      {r.sector && <span className="rounded bg-gray-100 px-1 py-0.5 text-[8px] font-bold text-gray-500 uppercase">{r.sector}</span>}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11.5px] text-gray-400">
                      {r.area && <span>{r.area}</span>}
                      {r.area && r.city && <span>·</span>}
                      <span>{r.city}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.matching_jobs.slice(0, 3).map((j) => (
                        <span key={j.id} className="inline-flex items-center gap-1 rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                          {j.title}
                          {j.source && <span className="text-[7px] text-green-500">via {j.source}</span>}
                        </span>
                      ))}
                      {r.matching_jobs.length > 3 && (
                        <span className="text-[10px] text-gray-400">+{r.matching_jobs.length - 3} more</span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                    {r.matching_jobs.length} role{r.matching_jobs.length !== 1 ? 's' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}

          {searchQuery && jobSearchResults && jobSearchResults.length === 0 && (
            <div
              className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-gray-100 bg-white p-5 text-center shadow-[0_12px_40px_rgba(15,23,42,0.14)]"
              style={{ animation: "fadeSlideUp 0.15s ease-out" }}
            >
              <Search className="mx-auto h-5 w-5 text-gray-200" />
              <p className="mt-2 text-xs font-medium text-gray-500">No jobs found for &quot;{searchQuery}&quot;</p>
              <p className="mt-0.5 text-[11.5px] text-gray-400">Try a different role or skill</p>
            </div>
          )}
        </div>

        {/* City dropdown */}
        <div className="relative shrink-0" data-city-dropdown>
          <button
            type="button"
            onClick={() => setCityDropdownOpen(!cityDropdownOpen)}
            className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold shadow-lg transition-all hover:shadow-xl"
          >
            <MapPin className="h-4 w-4 text-green-500" />
            <span className="text-gray-800">{selectedCity}</span>
            {(() => {
              const cc = (cities ?? []).find(c => c.city === selectedCity);
              return cc ? (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11.5px] font-bold text-green-700">{cc.count}</span>
              ) : null;
            })()}
            <ChevronDown className={cn("h-4 w-4 text-gray-400 transition-transform", cityDropdownOpen && "rotate-180")} />
          </button>
          {cityDropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-2xl"
              style={{ animation: "fadeSlideUp 0.15s ease-out" }}
            >
              <div className="border-b border-gray-50 px-4 py-2.5">
                <span className="text-[11.5px] font-bold uppercase tracking-wider text-gray-400">Select City</span>
              </div>
              {(cities ?? []).map((c) => (
                <button
                  key={c.city}
                  type="button"
                  onClick={() => { setSelectedCity(c.city); setCityDropdownOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                    selectedCity === c.city
                      ? "bg-green-50"
                      : "hover:bg-gray-50"
                  )}
                >
                  <div className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg text-[12.5px] font-bold",
                    selectedCity === c.city
                      ? "bg-green-500 text-white"
                      : "bg-gray-100 text-gray-500"
                  )}>
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn("text-[13px] font-semibold", selectedCity === c.city ? "text-green-700" : "text-gray-800")}>
                      {c.city}
                    </div>
                    <div className="text-[11.5px] text-gray-400">{c.count} companies</div>
                  </div>
                  {selectedCity === c.city && (
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Map / Grid view toggle */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-white p-1 shadow-lg">
          <button
            type="button"
            onClick={() => setViewMode("map")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200",
              viewMode === "map" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
            )}
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200",
              viewMode === "grid" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-800"
            )}
          >
            Grid
          </button>
        </div>

        {/* Hiring filter */}
        <button
          type="button"
          onClick={() => setHiringOnly(!hiringOnly)}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold shadow-lg transition-all duration-200",
            hiringOnly
              ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-500/25"
              : "bg-white text-gray-600 hover:bg-green-50 hover:text-green-700"
          )}
        >
          <BriefcaseBusiness className="h-4 w-4" />
          {hiringOnly ? "Hiring" : "All"}
        </button>

        {/* Tools group — Filters, For You, Saved live inside one shared
            surface (like the Map/Grid toggle) instead of each floating as
            its own pill, so the toolbar reads as a few logical clusters
            instead of 8 equal-weight buttons in a row. */}
        <div className="flex shrink-0 items-center gap-0.5 rounded-xl bg-white p-1 shadow-lg">
          {/* Filters toggle — closed by default on every screen size so the
              map stays full-bleed until you actually want the facet list. */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200",
              mobileFiltersOpen
                ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-green-50 hover:text-green-700"
            )}
          >
            <Filter className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && (
              <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-bold", mobileFiltersOpen ? "bg-white/20" : "bg-green-500 text-white")}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {targetRoles.length > 0 && (
            <button
              type="button"
              onClick={() => setForYouOnly((v) => !v)}
              title={`Match your target roles: ${targetRoles.join(", ")}`}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-all duration-200",
                forYouOnly
                  ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-green-50 hover:text-green-700"
              )}
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">For You</span>
            </button>
          )}

          <SavedSearchesButton filters={currentFilters} onApply={applySavedSearch} grouped />
        </div>

        {/* Status */}
        {isLoading && (
          <div className="hidden items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-medium text-gray-500 shadow-lg sm:flex">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-green-500" /> Loading…
          </div>
        )}
        {isError && (
          <div className="hidden items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-medium text-red-500 shadow-lg sm:flex">
            <AlertTriangle className="h-3.5 w-3.5" /> Error
          </div>
        )}
        {!isLoading && !isError && filteredCompanies && (
          <div className="hidden items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold shadow-lg sm:flex">
            {searchQuery && (
              <span className="rounded-md bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                &quot;{searchQuery}&quot;
              </span>
            )}
            <Building2 className="h-3.5 w-3.5 text-green-500" />
            <span className="text-gray-700">{totalCount} compan{totalCount !== 1 ? 'ies' : 'y'}</span>
            {hiringCount > 0 && (
              <>
                <span className="text-gray-200">|</span>
                <span className="flex items-center gap-1 text-green-600">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  {hiringCount} hiring
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Zoom controls (map view only) ── */}
      {viewMode === "map" && (
      <div className="absolute right-4 top-4 flex flex-col overflow-hidden rounded-xl bg-white shadow-lg">
        <button
          className="flex h-9 w-9 items-center justify-center text-gray-400 transition hover:bg-green-50 hover:text-green-600"
          onClick={() => mapRef.current?.zoomIn({ duration: 200 })}
        >
          <Plus className="h-4 w-4" />
        </button>
        <div className="mx-2.5 h-px bg-gray-100" />
        <button
          className="flex h-9 w-9 items-center justify-center text-gray-400 transition hover:bg-green-50 hover:text-green-600"
          onClick={() => mapRef.current?.zoomOut({ duration: 200 })}
        >
          <Minus className="h-4 w-4" />
        </button>
        <div className="mx-2.5 h-px bg-gray-100" />
        <button
          className="flex h-9 w-9 items-center justify-center text-gray-400 transition hover:bg-green-50 hover:text-green-600"
          onClick={() => {
            const c = getCityCenter(selectedCity);
            mapRef.current?.flyTo({ center: [c.longitude, c.latitude], zoom: c.zoom, duration: 600 });
          }}
        >
          <Compass className="h-4 w-4" />
        </button>
      </div>
      )}

      {/* ── Filter panel ── */}
      {/* Mobile backdrop — the panel becomes a bottom sheet below `md`. */}
      {mobileFiltersOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileFiltersOpen(false)}
        />
      )}
      <div
        className={cn(
          "scroll-thin z-50 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]",
          "fixed inset-x-3 bottom-3 max-h-[75vh]",
          "md:absolute md:inset-x-auto md:bottom-auto md:left-4 md:top-20 md:z-30 md:w-56 md:max-h-[calc(100%-100px)]",
          mobileFiltersOpen ? "block" : "hidden"
        )}
        style={{ animation: "fadeSlideUp 0.3s ease-out" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-green-50 bg-white/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-green-100 to-emerald-100">
            <Filter className="h-3.5 w-3.5 text-green-600" />
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Filters</h3>
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto text-[11.5px] font-semibold text-gray-400 transition-colors hover:text-red-500"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(false)}
            className={cn("shrink-0 rounded-full bg-gray-100 p-1 text-gray-500 transition-colors hover:bg-gray-200", activeFilterCount === 0 && "ml-auto")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-gray-50 px-3 py-2.5">
            {selectedType && (
              <FilterChip label={selectedType} onRemove={() => setSelectedType(null)} />
            )}
            {selectedStage && (
              <FilterChip label={selectedStage} onRemove={() => setSelectedStage(null)} />
            )}
            {selectedArea && (
              <FilterChip label={selectedArea} onRemove={() => setSelectedArea(null)} />
            )}
            {selectedSector && (
              <FilterChip label={selectedSector} onRemove={() => setSelectedSector(null)} />
            )}
            {selectedDepartment && (
              <FilterChip label={selectedDepartment} onRemove={() => setSelectedDepartment(null)} />
            )}
          </div>
        )}

        {/* Type */}
        <div className="px-3 pb-2 pt-3">
          <span className="px-1 text-[11.5px] font-bold uppercase tracking-widest text-green-500">Type</span>
          <div className="mt-1.5 flex flex-col gap-0.5">
            <button type="button" onClick={() => setSelectedType(null)}
              className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                selectedType === null ? "bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-white shadow-md shadow-green-500/20" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
              )}>
              <Blocks className="h-3.5 w-3.5" />
              All types
            </button>
            {types?.map((t) => {
              const Icon = t.type === "Startup" ? Rocket : t.type === "Growth" ? TrendingUp : t.type === "Public" ? Landmark : Building;
              return (
                <button key={t.type} type="button" onClick={() => setSelectedType(selectedType === t.type ? null : t.type)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                    selectedType === t.type ? "bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-white shadow-md shadow-green-500/20" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
                  )}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">{t.type}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[11.5px] font-bold",
                    selectedType === t.type ? "bg-white/20" : "bg-gray-100 text-gray-500"
                  )}>{t.count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mx-3 h-px bg-gray-100" />

        {/* Stage */}
        <div className="px-3 py-3">
          <span className="px-1 text-[11.5px] font-bold uppercase tracking-widest text-green-500">Stage</span>
          <div className="mt-1.5 flex flex-col gap-0.5">
            <button type="button" onClick={() => setSelectedStage(null)}
              className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                selectedStage === null ? "bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-white shadow-md shadow-green-500/20" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
              )}>
              <Blocks className="h-3.5 w-3.5" />
              All stages
            </button>
            {stages?.map((s) => {
              const Icon = s.stage === "Seed" ? Sprout : s.stage.startsWith("Series") ? CircleDollarSign : s.stage === "Growth" ? TrendingUp : Landmark;
              return (
                <button key={s.stage} type="button" onClick={() => setSelectedStage(selectedStage === s.stage ? null : s.stage)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                    selectedStage === s.stage ? "bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-white shadow-md shadow-green-500/20" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
                  )}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="flex-1 text-left">{s.stage}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[11.5px] font-bold",
                    selectedStage === s.stage ? "bg-white/20" : "bg-gray-100 text-gray-500"
                  )}>{s.count}</span>
                </button>
              );
            })}
            {stages?.length === 0 && <EmptyFacetHint text="No stage data for this city yet" />}
          </div>
        </div>
        <div className="mx-3 h-px bg-gray-100" />

        {/* Area */}
        <div className="px-3 py-3">
          <span className="px-1 text-[11.5px] font-bold uppercase tracking-widest text-green-500">Area</span>
          <div className="mt-1.5 flex flex-col gap-0.5">
            {areas?.map((a) => (
              <button key={a.area} type="button" onClick={() => setSelectedArea(selectedArea === a.area ? null : a.area)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                  selectedArea === a.area ? "bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-white shadow-md shadow-green-500/20" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
                )}>
                <MapPinned className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">{a.area}</span>
                <span className={cn("rounded-full px-1.5 py-0.5 text-[11.5px] font-bold",
                  selectedArea === a.area ? "bg-white/20" : "bg-gray-100 text-gray-500"
                )}>{a.count}</span>
              </button>
            ))}
            {areas?.length === 0 && <EmptyFacetHint text="No area data for this city yet" />}
          </div>
        </div>
        <div className="mx-3 h-px bg-gray-100" />

        {/* Sector */}
        <div className="px-3 py-3">
          <span className="px-1 text-[11.5px] font-bold uppercase tracking-widest text-green-500">Sector</span>
          <div className="mt-1.5 flex flex-col gap-0.5">
            <button type="button" onClick={() => setSelectedSector(null)}
              className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                selectedSector === null ? "bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-white shadow-md shadow-green-500/20" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
              )}>
              <Factory className="h-3.5 w-3.5" />
              All sectors
            </button>
            {sectors?.map((s) => {
              const active = selectedSector === s.sector;
              const cfg = getSectorConfig(s.sector) ?? DEFAULT_SECTOR;
              return (
                <button key={s.sector} type="button" onClick={() => setSelectedSector(active ? null : s.sector)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                    active ? "bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-white shadow-md shadow-green-500/20" : "text-gray-500 hover:bg-green-50 hover:text-green-700"
                  )}>
                  <span className="h-3 w-3 rounded-full border-2" style={{ borderColor: cfg.color, background: active ? "white" : `${cfg.color}20` }} />
                  <span className="flex-1 text-left">{s.sector}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[11.5px] font-bold",
                    active ? "bg-white/20" : "bg-gray-100 text-gray-500"
                  )}>{s.count}</span>
                </button>
              );
            })}
            {sectors?.length === 0 && <EmptyFacetHint text="No sector data for this city yet" />}
          </div>
        </div>

        {/* Department — filters by what kind of role a company is hiring
            for (Engineering, Data & AI, HR & Recruiting, etc.), not the
            company's industry. */}
        <div className="border-t border-gray-50 px-3 py-3">
          <span className="px-1 text-[11.5px] font-bold uppercase tracking-widest text-green-500">Hiring for</span>
          <div className="mt-1.5 flex flex-col gap-0.5">
            <button type="button" onClick={() => setSelectedDepartment(null)}
              className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                selectedDepartment === null ? "bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-white shadow-md shadow-green-500/20" : "text-gray-600 hover:bg-green-50 hover:text-green-700"
              )}>
              <Layers className="h-3.5 w-3.5" />
              All departments
            </button>
            {departments?.map((d) => {
              const active = selectedDepartment === d.department;
              return (
                <button key={d.department} type="button" onClick={() => setSelectedDepartment(active ? null : d.department)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-all",
                    active ? "bg-gradient-to-r from-green-500 to-emerald-600 font-semibold text-white shadow-md shadow-green-500/20" : "text-gray-500 hover:bg-green-50 hover:text-green-700"
                  )}>
                  <span className="flex-1 text-left">{d.department}</span>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[11.5px] font-bold",
                    active ? "bg-white/20" : "bg-gray-100 text-gray-500"
                  )}>{d.count}</span>
                </button>
              );
            })}
            {departments?.length === 0 && <EmptyFacetHint text="No department data yet" />}
          </div>
        </div>
      </div>

      {/* ── Attribution ── */}
      <div className="absolute bottom-2 right-2 text-[11.5px] text-gray-400">
        MapLibre | © CARTO | © OpenStreetMap
      </div>
    </div>
  );
}
