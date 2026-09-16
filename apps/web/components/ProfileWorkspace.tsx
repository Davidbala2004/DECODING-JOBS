"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Github, Linkedin, Code2, Loader2, Sparkles, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useIdentityStore } from "@/lib/identityStore";
import { EmailGate } from "@/components/EmailGate";
import { getPreferences, updatePreferences } from "@/lib/api";

const CITIES = [
  "Bengaluru", "Chennai", "Hyderabad", "Mumbai", "Pune", "Delhi NCR",
  "Kolkata", "Ahmedabad", "Kochi", "Coimbatore", "Thiruvananthapuram",
  "Madurai", "Kozhikode", "Visakhapatnam", "Mysuru",
];
const WORK_MODES = [
  { value: "", label: "No preference" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];
export const NOTICE_PERIODS = [
  { value: "", label: "Not specified" },
  { value: "immediate", label: "Immediate joiner" },
  { value: "15_days", label: "15 days" },
  { value: "30_days", label: "30 days" },
  { value: "60_days", label: "60 days" },
  { value: "90_days", label: "90 days" },
];

export function noticePeriodLabel(value: string | null): string | null {
  if (!value) return null;
  return NOTICE_PERIODS.find((n) => n.value === value)?.label ?? value;
}

export function formatExperience(years: number | null): string {
  if (years === null) return "Experience not set";
  if (years === 0) return "Fresher";
  return `${years} yr${years === 1 ? "" : "s"} exp`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-gray-500">{children}</label>;
}

function LinkField({
  icon: Icon,
  placeholder,
  value,
  onChange,
  verified,
}: {
  icon: React.ElementType;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  verified?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      <Input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-xs" />
      {value && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase",
            verified ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
          )}
        >
          {verified ? "Verified" : "Unverified"}
        </span>
      )}
    </div>
  );
}

const selectCls =
  "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/40";

export function ProfileWorkspace() {
  const email = useIdentityStore((s) => s.email);

  if (!email) {
    return <EmailGate title="Your preferences" subtitle="Sign in with Google to save your job-search preferences" />;
  }

  return <ProfileForm email={email} />;
}

function ProfileForm({ email }: { email: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["preferences", email],
    queryFn: () => getPreferences(email),
  });

  const [targetRoles, setTargetRoles] = useState("");
  const [skills, setSkills] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState("");
  const [minSalary, setMinSalary] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [leetcodeUrl, setLeetcodeUrl] = useState("");
  const [visibleToRecruiters, setVisibleToRecruiters] = useState(true);

  // Load fetched preferences into the form once, not on every refetch —
  // otherwise typing would get clobbered by a background refetch.
  useEffect(() => {
    if (!data) return;
    setTargetRoles(data.target_roles.join(", "));
    setSkills(data.skills.join(", "));
    setCities(data.preferred_cities);
    setWorkMode(data.preferred_work_mode || "");
    setMinSalary(data.min_salary ? String(data.min_salary) : "");
    setExperienceYears(data.experience_years !== null ? String(data.experience_years) : "");
    setNoticePeriod(data.notice_period || "");
    setGithubUrl(data.github_url || "");
    setLinkedinUrl(data.linkedin_url || "");
    setLeetcodeUrl(data.leetcode_url || "");
    setVisibleToRecruiters(data.profile_visible_to_recruiters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === undefined]);

  const mutation = useMutation({
    mutationFn: () =>
      updatePreferences({
        email,
        profileVisibleToRecruiters: visibleToRecruiters,
        targetRoles: targetRoles.split(",").map((s) => s.trim()).filter(Boolean),
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
        preferredCities: cities,
        preferredWorkMode: workMode || null,
        minSalary: minSalary ? Number(minSalary) : null,
        experienceYears: experienceYears ? Number(experienceYears) : null,
        noticePeriod: noticePeriod || "",
        githubUrl,
        linkedinUrl,
        leetcodeUrl,
      }),
    onSuccess: (updated) => queryClient.setQueryData(["preferences", email], updated),
  });

  const toggleCity = (city: string) => {
    setCities((prev) => (prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city]));
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-green-500" />
      </div>
    );
  }

  return (
    <main className="scroll-thin flex-1 overflow-y-auto bg-gradient-to-b from-green-50/40 to-white">
      <div className="mx-auto max-w-xl px-4 py-10 sm:py-14">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/25">
            <User className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Your preferences</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Used by the AI Assistant and search to personalize results — you won&apos;t need to repeat this every time.
          </p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
          className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]"
        >
          <div>
            <FieldLabel>Target roles</FieldLabel>
            <Input
              placeholder="Backend Engineer, Data Scientist"
              value={targetRoles}
              onChange={(e) => setTargetRoles(e.target.value)}
            />
            <p className="mt-1 text-[10.5px] text-gray-400">Comma-separated</p>
          </div>

          <div>
            <FieldLabel>Preferred cities</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {CITIES.map((city) => {
                const active = cities.includes(city);
                return (
                  <button
                    key={city}
                    type="button"
                    onClick={() => toggleCity(city)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all",
                      active
                        ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-sm shadow-green-500/20"
                        : "border border-gray-200 text-gray-500 hover:border-green-200 hover:bg-green-50 hover:text-green-700"
                    )}
                  >
                    {city}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Work mode</FieldLabel>
              <select className={selectCls} value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
                {WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <FieldLabel>Min salary (₹/yr)</FieldLabel>
              <Input type="number" placeholder="1200000" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Experience (yrs)</FieldLabel>
              <Input type="number" min={0} placeholder="0 = fresher" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} />
            </div>
            <div>
              <FieldLabel>Notice period</FieldLabel>
              <select className={selectCls} value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)}>
                {NOTICE_PERIODS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <FieldLabel>Skills</FieldLabel>
            <Input
              placeholder="Python, React, AWS, Docker"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
            <p className="mt-1 text-[10.5px] text-gray-400">Comma-separated</p>
          </div>

          <div className="border-t border-gray-50 pt-4">
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
              Credibility links <span className="font-normal normal-case text-gray-400">— shown to recruiters searching for you</span>
            </p>
            <div className="flex flex-col gap-2.5">
              <LinkField
                icon={Github}
                placeholder="https://github.com/you"
                value={githubUrl}
                onChange={setGithubUrl}
                verified={data?.github_verified && githubUrl === data.github_url}
              />
              <LinkField
                icon={Linkedin}
                placeholder="https://linkedin.com/in/you"
                value={linkedinUrl}
                onChange={setLinkedinUrl}
                verified={data?.linkedin_verified && linkedinUrl === data.linkedin_url}
              />
              <LinkField
                icon={Code2}
                placeholder="https://leetcode.com/you"
                value={leetcodeUrl}
                onChange={setLeetcodeUrl}
                verified={data?.leetcode_verified && leetcodeUrl === data.leetcode_url}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-3">
            <button
              type="button"
              role="switch"
              aria-checked={visibleToRecruiters}
              onClick={() => setVisibleToRecruiters((v) => !v)}
              className={cn(
                "relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors",
                visibleToRecruiters ? "bg-green-500" : "bg-gray-300"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  visibleToRecruiters ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </button>
            <div>
              <p className="text-[12px] font-semibold text-gray-700">
                Visible to recruiters
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
                {visibleToRecruiters
                  ? "Verified recruiters searching for your target roles can find and unlock this profile. Turn this off to stay hidden from candidate search entirely."
                  : "Your profile is hidden from recruiter search — no company can find or unlock it, even a perfect match."}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl disabled:opacity-60"
          >
            {mutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
            ) : mutation.isSuccess ? (
              <><CheckCircle2 className="h-4 w-4" /> Saved</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Save preferences</>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
