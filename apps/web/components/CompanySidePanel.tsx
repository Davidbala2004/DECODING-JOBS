"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  FileText,
  ChevronDown,
  Sparkles,
  MapPin,
  AlertTriangle,
  Loader2,
  Briefcase,
  Users,
  Calendar,
  Zap,
  Globe,
  Linkedin,
  TrendingUp,
  ArrowUpRight,
  Bookmark,
  GraduationCap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useMapSelectionStore } from "@/lib/store";
import { useIdentityStore } from "@/lib/identityStore";
import {
  getCompanyById,
  getJobsByCompany,
  submitApplication,
  saveJob,
  listResumes,
  type Job,
  type WorkMode,
  type Company,
  type Resume,
} from "@/lib/api";

const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};

function getInitials(name: string): string {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatSalaryRange(job: Job): string {
  if (job.salary_min && job.salary_max) {
    return `₹${Number(job.salary_min).toLocaleString("en-IN")} – ₹${Number(job.salary_max).toLocaleString("en-IN")}`;
  }
  return "";
}

const SOURCE_BADGES: Record<string, { label: string; cls: string }> = {
  linkedin: { label: 'LinkedIn', cls: 'rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600' },
  indeed: { label: 'Indeed', cls: 'rounded-md bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700' },
  glassdoor: { label: 'Glassdoor', cls: 'rounded-md bg-green-50 px-1.5 py-0.5 text-[9px] font-bold text-green-700' },
  naukri: { label: 'Naukri', cls: 'rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600' },
  internshala: { label: 'Internshala', cls: 'rounded-md bg-yellow-50 px-1.5 py-0.5 text-[9px] font-bold text-yellow-700' },
  foundit: { label: 'Foundit', cls: 'rounded-md bg-orange-50 px-1.5 py-0.5 text-[9px] font-bold text-orange-600' },
  wellfound: { label: 'Wellfound', cls: 'rounded-md bg-purple-50 px-1.5 py-0.5 text-[9px] font-bold text-purple-600' },
  careers: { label: 'Careers', cls: 'rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-600' },
};

function EmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50">
        <MapPin className="h-6 w-6 text-green-400" />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">Select a company</p>
        <p className="mt-1 text-xs text-gray-400">Click any pin on the map to view roles & info</p>
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
        <AlertTriangle className="h-6 w-6 text-red-400" />
      </div>
      <p className="text-sm font-medium text-gray-900">Couldn&apos;t load details</p>
      <p className="text-xs text-gray-400">Try selecting again</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      <div className="h-20 animate-pulse rounded-2xl bg-green-50" />
      <div className="h-16 animate-pulse rounded-xl bg-gray-50" />
      <div className="h-32 animate-pulse rounded-xl bg-gray-50" />
    </div>
  );
}

function CompanyInfoBar({ company }: { company: Company }) {
  const items = [
    company.active_job_count > 0 && {
      icon: Briefcase,
      label: `${company.active_job_count} open`,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    company.team_size && {
      icon: Users,
      label: company.team_size,
      color: "text-gray-600",
      bg: "bg-gray-50",
    },
    company.founded_year && {
      icon: Calendar,
      label: `Est. ${company.founded_year}`,
      color: "text-gray-600",
      bg: "bg-gray-50",
    },
    company.total_funding && {
      icon: TrendingUp,
      label: company.total_funding,
      color: "text-gray-600",
      bg: "bg-gray-50",
    },
  ].filter(Boolean) as { icon: React.ElementType; label: string; color: string; bg: string }[];

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${item.color} ${item.bg}`}
        >
          <item.icon className="h-3 w-3" />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function RoleCard({
  job,
  isSaved,
  onSave,
  canSave,
}: {
  job: Job;
  isSaved: boolean;
  onSave: () => void;
  canSave: boolean;
}) {
  const mode = job.work_mode ? WORK_MODE_LABELS[job.work_mode] : null;
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 transition-all hover:border-green-200 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-gray-900">{job.title}</p>
          {job.salary_min || job.salary_max ? (
            <p className="mt-0.5 text-[11px] text-gray-400">{formatSalaryRange(job)}</p>
          ) : null}
          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
            {mode && (
              <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500">
                {mode}
              </span>
            )}
            {job.source && SOURCE_BADGES[job.source] && (
              <span className={SOURCE_BADGES[job.source]!.cls}>
                {SOURCE_BADGES[job.source]!.label}
              </span>
            )}
            {job.source && !SOURCE_BADGES[job.source] && (
              <span className="rounded-md bg-gray-50 px-1.5 py-0.5 text-[9px] font-bold text-gray-500 capitalize">
                {job.source}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canSave && (
            <button
              type="button"
              onClick={onSave}
              disabled={isSaved}
              title={isSaved ? "Saved to your tracker" : "Save to your tracker"}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg border transition-all",
                isSaved
                  ? "border-green-200 bg-green-50 text-green-600"
                  : "border-gray-200 text-gray-400 hover:border-green-200 hover:bg-green-50 hover:text-green-600"
              )}
            >
              <Bookmark className="h-3.5 w-3.5" fill={isSaved ? "currentColor" : "none"} />
            </button>
          )}
          <Link
            href={`/assistant?jobId=${job.id}`}
            title="Prep for this role with the AI Assistant"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-all hover:border-green-200 hover:bg-green-50 hover:text-green-600"
          >
            <GraduationCap className="h-3.5 w-3.5" />
          </Link>
          {job.apply_url ? (
            <a
              href={job.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm shadow-green-500/20 transition-all hover:shadow-md hover:shadow-green-500/30"
            >
              <Zap className="h-3 w-3" />
              APPLY
            </a>
          ) : (
            <span className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-[10px] font-bold text-gray-400">
              APPLY
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function CompanySidePanel() {
  const selectedCompanyId = useMapSelectionStore((s) => s.selectedCompanyId);
  const email = useIdentityStore((s) => s.email);
  const queryClient = useQueryClient();

  const [descExpanded, setDescExpanded] = useState(false);
  const [resumeDropdownOpen, setResumeDropdownOpen] = useState(false);
  const [selectedResumeId, setSelectedResumeId] = useState<number | null>(null);
  const resumeDropdownRef = useRef<HTMLDivElement>(null);

  const resumesQuery = useQuery({
    queryKey: ["resumes", email],
    queryFn: () => listResumes(email as string),
    enabled: !!email,
  });
  // Memoized so the auto-select effect below only re-runs when the actual
  // resume list changes, not on every render (resumesQuery.data ?? [] would
  // otherwise be a new array identity each time, before the query resolves).
  const resumes: Resume[] = useMemo(() => resumesQuery.data ?? [], [resumesQuery.data]);

  useEffect(() => {
    if (resumes[0] && (selectedResumeId === null || !resumes.some((r) => r.id === selectedResumeId))) {
      setSelectedResumeId(resumes[0].id);
    }
  }, [resumes, selectedResumeId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (resumeDropdownRef.current && !resumeDropdownRef.current.contains(e.target as Node)) {
        setResumeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const companyQuery = useQuery({
    queryKey: ["company", selectedCompanyId],
    queryFn: () => getCompanyById(selectedCompanyId as number),
    enabled: selectedCompanyId !== null,
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs", "company", selectedCompanyId],
    queryFn: () => getJobsByCompany(selectedCompanyId as number),
    enabled: selectedCompanyId !== null,
  });

  const applyMutation = useMutation({
    mutationFn: (v: { jobId: number; resumeFilename: string }) =>
      submitApplication({ ...v, userEmail: email }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["applicationBoard", email] }),
  });
  // Destructured out so the reset effect below can depend on this specific
  // (stable) function instead of the whole mutation object, which is a new
  // object every render.
  const { reset: resetApplyMutation } = applyMutation;

  const [savedJobIds, setSavedJobIds] = useState<Set<number>>(new Set());
  const saveMutation = useMutation({
    mutationFn: (jobId: number) => saveJob({ jobId, userEmail: email as string }),
    onSuccess: (_data, jobId) => {
      setSavedJobIds((prev) => new Set(prev).add(jobId));
      queryClient.invalidateQueries({ queryKey: ["applicationBoard", email] });
    },
  });

  // Which open role "Apply" targets — was silently hardcoded to jobs[0]
  // before, so a company with several roles always tracked an application
  // to whichever one happened to load first, regardless of which one the
  // user actually meant to apply to.
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resetApplyMutation();
    setSavedJobIds(new Set());
    setSelectedJobId(null);
    setDescExpanded(false);
  }, [selectedCompanyId, resetApplyMutation]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (selectedCompanyId === null) return <EmptyState />;
  if (companyQuery.isLoading) return <LoadingSkeleton />;
  if (companyQuery.isError || !companyQuery.data) return <ErrorState />;

  const company = companyQuery.data;
  const jobs = jobsQuery.data ?? [];
  const pros = company.sentiment_summary?.pros ?? [];
  const cons = company.sentiment_summary?.cons ?? [];
  const hasSentiment = pros.length > 0 || cons.length > 0;
  // Defaults to the first role, but the dropdown below lets the user pick
  // whichever one they actually mean to apply to.
  const primaryJob = jobs.find((j) => j.id === selectedJobId) ?? jobs[0];
  // Dynamic section numbering — skip sections with no data
  let _sec = 0;
  const hasApplied = applyMutation.isSuccess && applyMutation.data?.job_id === primaryJob?.id;

  // Extract domain for display
  const websiteDomain = company.website_url
    ? (() => {
        try { return new URL(company.website_url).hostname.replace("www.", ""); }
        catch {
          const url = company.website_url.replace(/^[/]+/, '').split(/[/s?#]/)[0];
          return url && url.includes('.') ? url.replace("www.", "") : null;
        }
      })()
    : null;

  // Same logo-proxy resolution the map pins use, so the profile header shows
  // the real company mark instead of just a name.
  const logoUrl = websiteDomain
    ? `/api/logo?domain=${websiteDomain}`
    : company.logo_url?.includes("domain=")
      ? (() => { try { return `/api/logo?domain=${new URL(company.logo_url!).searchParams.get("domain")}`; } catch { return null; } })()
      : null;

  return (
    <div className="scroll-thin flex h-full w-full flex-col gap-3 overflow-y-auto p-3">
      <style jsx global>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* ── Company Header ── */}
      <div className="rounded-2xl bg-gradient-to-br from-green-50 via-white to-emerald-50/50 p-3.5">
        <div className="flex items-start gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              className="h-11 w-11 shrink-0 rounded-xl border border-white bg-white object-contain p-1 shadow-sm"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-sm font-bold text-white shadow-sm">
              {getInitials(company.name)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-gray-900">{company.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {company.sector && (
                <span className="rounded-md bg-green-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-700">
                  {company.sector}
                </span>
              )}
              {company.stage && (
                <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-500">
                  {company.stage}
                </span>
              )}
              {company.area && (
                <span className="flex items-center gap-0.5 text-[11px] text-gray-500">
                  <MapPin className="h-2.5 w-2.5 text-green-400" />
                  {company.area}{company.city ? `, ${company.city}` : ""}
                </span>
              )}
            </div>
          </div>
        </div>

        {company.description && (
          <p className="mt-2.5 line-clamp-3 text-[11px] leading-relaxed text-gray-600">
            {company.description}
          </p>
        )}

        <div className="mt-2.5">
          <CompanyInfoBar company={company} />
        </div>
      </div>

      {/* ── Links ── */}
      {(company.website_url || company.linkedin_url) && (
        <div className="flex gap-1.5">
          {company.website_url && (
            <a
              href={company.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-600 transition-all hover:border-green-200 hover:bg-green-50 hover:text-green-700"
            >
              <Globe className="h-3.5 w-3.5" />
              {websiteDomain || "Website"}
              <ArrowUpRight className="h-3 w-3 text-gray-400" />
            </a>
          )}
          {company.linkedin_url && (
            <a
              href={company.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-600 transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
            >
              <Linkedin className="h-3.5 w-3.5" />
              LinkedIn
              <ArrowUpRight className="h-3 w-3 text-gray-400" />
            </a>
          )}
        </div>
      )}

      {/* ── Section: Open Roles ── */}
      <div className="rounded-xl border border-gray-100 bg-white p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-md bg-green-100 text-[9px] font-bold text-green-700">{++_sec}</span>
          <h2 className="text-xs font-bold text-gray-900">Open Roles</h2>
          {jobs.length > 0 && (
            <span className="ml-auto rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">{jobs.length}</span>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          {jobs.length > 0 ? (
            jobs.map((job) => (
              <RoleCard
                key={job.id}
                job={job}
                canSave={!!email}
                isSaved={savedJobIds.has(job.id)}
                onSave={() => saveMutation.mutate(job.id)}
              />
            ))
          ) : (
            <p className="py-2 text-center text-[11px] text-gray-400">No active roles right now</p>
          )}
        </div>
      </div>

      {/* ── Section: Company Pulse (only if data exists) ── */}
      {hasSentiment && (
        <div className="rounded-xl border border-gray-100 bg-white p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="flex h-4.5 w-4.5 items-center justify-center rounded-md bg-green-100 text-[9px] font-bold text-green-700">{++_sec}</span>
            <h2 className="text-xs font-bold text-gray-900">Company Pulse</h2>
          </div>
          <div className="flex flex-col gap-1">
            {pros.map((pro) => (
              <div key={pro} className="flex items-start gap-1.5 rounded-lg bg-green-50/50 px-2 py-1.5">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                <span className="text-[11px] text-gray-700">{pro}</span>
              </div>
            ))}
            {cons.map((con) => (
              <div key={con} className="flex items-start gap-1.5 rounded-lg bg-red-50/50 px-2 py-1.5">
                <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                <span className="text-[11px] text-gray-700">{con}</span>
              </div>
            ))}
          </div>
          {company.culture_score !== null && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5">
              <span className="text-[10px] font-medium text-gray-500">Culture Score</span>
              <span className="text-[11px] font-bold text-gray-900">{company.culture_score!.toFixed(1)} / 5</span>
            </div>
          )}
        </div>
      )}

      {/* ── Section: Apply ── */}
      <div className="rounded-xl border border-green-100 bg-gradient-to-br from-green-50/30 to-white p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="flex h-4.5 w-4.5 items-center justify-center rounded-md bg-green-100 text-[9px] font-bold text-green-700">{++_sec}</span>
          <h2 className="text-xs font-bold text-gray-900">Apply</h2>
        </div>
        <div className="flex flex-col gap-2">
          {/* Role selector — only shown when there's an actual choice to make.
              Everything below (resume attach, tailor-with-AI, submit, and the
              Job Description section) targets whichever role is picked here. */}
          {jobs.length > 1 && (
            <div className="relative" ref={roleDropdownRef}>
              <button
                type="button"
                onClick={() => setRoleDropdownOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left transition-all hover:border-green-200"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-gray-600">
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  <span className="truncate font-semibold text-gray-800">{primaryJob?.title}</span>
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform", roleDropdownOpen && "rotate-180")} />
              </button>
              {roleDropdownOpen && (
                <div
                  className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
                  style={{ animation: "fadeSlideUp 0.15s ease-out" }}
                >
                  {jobs.map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => {
                        setSelectedJobId(j.id);
                        setDescExpanded(false);
                        setRoleDropdownOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors",
                        j.id === primaryJob?.id ? "bg-green-50 text-green-700 font-semibold" : "text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      <span className="truncate">{j.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resume selector — a real dropdown over the user's uploaded resumes */}
          {email && resumes.length > 0 ? (
            <div className="relative" ref={resumeDropdownRef}>
              <button
                type="button"
                onClick={() => setResumeDropdownOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-left transition-all hover:border-green-200"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-gray-600">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-green-500" />
                  <span className="truncate">
                    {resumes.find((r) => r.id === selectedResumeId)?.filename ?? "Select a resume"}
                  </span>
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform", resumeDropdownOpen && "rotate-180")} />
              </button>
              {resumeDropdownOpen && (
                <div
                  className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-white py-1 shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
                  style={{ animation: "fadeSlideUp 0.15s ease-out" }}
                >
                  {resumes.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedResumeId(r.id);
                        setResumeDropdownOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] transition-colors",
                        r.id === selectedResumeId ? "bg-green-50 text-green-700 font-semibold" : "text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      <span className="truncate">{r.filename}</span>
                      {r.ats_score !== null && (
                        <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-500">
                          ATS {r.ats_score}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/assistant"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-white py-2 text-[11px] font-semibold text-gray-500 transition-all hover:border-green-200 hover:bg-green-50 hover:text-green-700"
            >
              <FileText className="h-3.5 w-3.5" />
              Upload a resume in AI Assistant
            </Link>
          )}

          {/* Tailor with AI — real resume analysis tailored to this job */}
          {primaryJob && resumes.length > 0 && (
            <Link
              href={`/assistant?jobId=${primaryJob.id}`}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-green-200 bg-white py-1.5 text-[10px] font-semibold text-green-600 transition-all hover:bg-green-50"
            >
              <Sparkles className="h-3 w-3" />
              Tailor resume for this role
            </Link>
          )}

          {/* Submit */}
          {hasApplied ? (
            <div className="flex items-center justify-center gap-1.5 rounded-xl bg-green-500 py-2.5 text-[11px] font-bold text-white shadow-md shadow-green-500/20">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Applied
            </div>
          ) : (
            <button
              className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-2.5 text-[11px] font-bold text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl hover:shadow-green-500/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!primaryJob || !selectedResumeId || applyMutation.isPending}
              title={!selectedResumeId ? "Upload a resume first" : undefined}
              onClick={() => {
                const resume = resumes.find((r) => r.id === selectedResumeId);
                if (!primaryJob || !resume) return;
                applyMutation.mutate({ jobId: primaryJob.id, resumeFilename: resume.filename });
              }}
            >
              {applyMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…</>
              ) : (
                <><Zap className="h-3.5 w-3.5" /> SUBMIT</>
              )}
            </button>
          )}
          {applyMutation.isError && (
            <p className="text-[10px] text-red-500">Submission failed. Try again.</p>
          )}
        </div>
      </div>

      {/* ── Section: Job Description — follows whichever role is selected
          in Apply above, so it's never silently showing a different role's
          description than the one you're about to apply to. Rendered with
          real paragraph breaks (whitespace-pre-line) instead of one dense
          blob, and collapsed by default since postings can run ~2000 chars
          in a 380px-wide panel. ── */}
      {primaryJob && (() => {
        const description = primaryJob.description?.trim() || "";
        const COLLAPSE_AT = 380;
        const isLong = description.length > COLLAPSE_AT;
        const shown = descExpanded || !isLong ? description : `${description.slice(0, COLLAPSE_AT).trimEnd()}…`;
        return (
          <div className="rounded-xl border border-gray-100 bg-white p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <span className="flex h-4.5 w-4.5 items-center justify-center rounded-md bg-green-100 text-[9px] font-bold text-green-700">{++_sec}</span>
              <h2 className="text-xs font-bold text-gray-900">Job Description</h2>
              {jobs.length > 1 && (
                <span className="ml-auto truncate text-[10px] font-semibold text-gray-400">{primaryJob.title}</span>
              )}
            </div>
            <p className="whitespace-pre-line text-[11px] leading-relaxed text-gray-600">
              {shown || "No description available."}
            </p>
            {isLong && (
              <button
                type="button"
                onClick={() => setDescExpanded((v) => !v)}
                className="mt-1.5 text-[10.5px] font-bold text-green-600 hover:text-green-700"
              >
                {descExpanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        );
      })()}

      {/* Bottom spacer */}
      <div className="h-2" />
    </div>
  );
}
