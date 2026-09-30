"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Github, Linkedin, Code2, Loader2, Search, ShieldCheck, Users2, LogOut, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useIdentityStore } from "@/lib/identityStore";
import { useRecruiterIdentityStore } from "@/lib/recruiterIdentityStore";
import { searchCandidates, type CandidateSearchResult } from "@/lib/api";
import { CandidateProfileModal } from "@/components/CandidateProfileModal";
import { NOTICE_PERIODS, formatExperience, noticePeriodLabel } from "@/components/ProfileWorkspace";

const CITIES = [
  "Bengaluru", "Chennai", "Hyderabad", "Mumbai", "Pune", "Delhi NCR",
  "Kolkata", "Ahmedabad", "Kochi", "Coimbatore", "Thiruvananthapuram",
  "Madurai", "Kozhikode", "Visakhapatnam", "Mysuru",
];
const WORK_MODES = [
  { value: "", label: "Any work mode" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];
const ANY_NOTICE_PERIODS = [{ value: "", label: "Any notice period" }, ...NOTICE_PERIODS.filter((n) => n.value)];

const selectCls =
  "flex h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/40";

function LinkBadge({ icon: Icon, verified }: { icon: React.ElementType; verified: boolean }) {
  return (
    <span
      title={verified ? "Reachable / verified" : "Present but unverified"}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-full",
        verified ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-300"
      )}
    >
      <Icon className="h-3 w-3" />
    </span>
  );
}

function CandidateCard({ candidate, onView }: { candidate: CandidateSearchResult; onView: () => void }) {
  const initials = `C${candidate.id}`;
  const verifiedCount = [candidate.github_verified, candidate.linkedin_verified, candidate.leetcode_verified].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-shadow hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-100 to-emerald-100 text-xs font-bold text-green-700">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-900">
            {candidate.target_roles[0] || "Job seeker"}
          </p>
          <p className="text-[12.5px] text-gray-400">
            {formatExperience(candidate.experience_years)}
            {candidate.preferred_work_mode ? ` · ${candidate.preferred_work_mode}` : ""}
          </p>
        </div>
        {candidate.ats_score !== null && (
          <span className="rounded-full bg-green-50 px-2 py-1 text-[11.5px] font-bold text-green-700">
            ATS {candidate.ats_score}
          </span>
        )}
      </div>

      {noticePeriodLabel(candidate.notice_period) && (
        <span
          className={cn(
            "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold",
            candidate.notice_period === "immediate" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
          )}
        >
          <Clock className="h-2.5 w-2.5" />
          {noticePeriodLabel(candidate.notice_period)}
        </span>
      )}

      {candidate.skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {candidate.skills.slice(0, 5).map((skill) => (
            <span key={skill} className="rounded-full bg-gray-50 px-2 py-0.5 text-[11.5px] font-medium text-gray-500">
              {skill}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <LinkBadge icon={Github} verified={candidate.github_verified} />
          <LinkBadge icon={Linkedin} verified={candidate.linkedin_verified} />
          <LinkBadge icon={Code2} verified={candidate.leetcode_verified} />
          {verifiedCount > 0 && <span className="text-[11.5px] font-semibold text-green-600">{verifiedCount} verified</span>}
        </div>
        <button
          type="button"
          onClick={onView}
          className={cn(
            "rounded-lg px-3 py-1.5 text-[12.5px] font-bold shadow-sm transition-all",
            candidate.already_unlocked
              ? "bg-gray-900 text-white hover:bg-gray-800"
              : "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-500/25 hover:shadow-md"
          )}
        >
          {candidate.already_unlocked ? "View profile" : "Unlock profile"}
        </button>
      </div>
    </div>
  );
}

export function CandidateSearchPanel() {
  const email = useIdentityStore((s) => s.email);
  const { companyName, clearRecruiterCompany } = useRecruiterIdentityStore();
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [experienceMin, setExperienceMin] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<number | null>(null);

  const { data: candidates, isLoading, isError } = useQuery({
    queryKey: ["candidateSearch", email, role, city, workMode, experienceMin, noticePeriod, verifiedOnly],
    queryFn: () =>
      searchCandidates({
        role: role || undefined,
        city: city || undefined,
        workMode: workMode || undefined,
        experienceMin: experienceMin ? Number(experienceMin) : undefined,
        noticePeriod: noticePeriod || undefined,
        verifiedOnly: verifiedOnly || undefined,
      }),
    enabled: !!email,
  });

  return (
    <main className="scroll-thin flex flex-1 flex-col overflow-y-auto bg-gradient-to-b from-green-50/40 to-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-green-600" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">Candidate search</h1>
              <p className="text-[12.5px] text-gray-400">Searching as {companyName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearRecruiterCompany}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-gray-400 hover:bg-gray-50 hover:text-gray-600"
          >
            <LogOut className="h-3.5 w-3.5" /> Switch company
          </button>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
            <Input
              placeholder="Role or skill (e.g. Backend Engineer, React)"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>
          <select className={selectCls} value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Any city</option>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={selectCls} value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
            {WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <Input
            type="number"
            min={0}
            placeholder="Min yrs exp"
            value={experienceMin}
            onChange={(e) => setExperienceMin(e.target.value)}
            className="h-9 w-28 text-xs"
          />
          <select className={selectCls} value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)}>
            {ANY_NOTICE_PERIODS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setVerifiedOnly((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold transition-colors",
              verifiedOnly ? "bg-green-50 text-green-700" : "text-gray-400 hover:text-gray-600"
            )}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Verified only
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-green-500" />
          </div>
        )}
        {isError && (
          <p className="py-16 text-center text-sm text-red-500">Couldn&apos;t load candidates. Try again.</p>
        )}
        {!isLoading && !isError && candidates && candidates.length === 0 && (
          <p className="py-16 text-center text-sm text-gray-400">No candidates match these filters yet.</p>
        )}
        {!isLoading && candidates && candidates.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {candidates.map((c) => (
              <CandidateCard key={c.id} candidate={c} onView={() => setSelectedCandidateId(c.id)} />
            ))}
          </div>
        )}
      </div>

      {selectedCandidateId !== null && (
        <CandidateProfileModal candidateId={selectedCandidateId} onClose={() => setSelectedCandidateId(null)} />
      )}
    </main>
  );
}
