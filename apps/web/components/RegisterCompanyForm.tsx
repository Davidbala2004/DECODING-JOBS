"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  Building2,
  Rocket,
  Check,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  MapPin,
  ChevronDown,
  Plus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useMapSelectionStore } from "@/lib/store";
import { useIdentityStore } from "@/lib/identityStore";
import { EmailGate } from "@/components/EmailGate";
import { registerCompany, registerJob, type Company, type EmploymentType, type WorkMode } from "@/lib/api";

const SECTORS = ["AI", "SaaS", "Fintech", "Consumer", "Healthtech", "Edtech", "Cloud/Infra", "Mobile", "Deeptech", "Other"];
const STAGES = ["Seed", "Early Stage", "Series A", "Series B", "Growth", "Public"];
const CITIES = [
  "Bengaluru", "Chennai", "Hyderabad", "Mumbai", "Pune", "Delhi NCR",
  "Kolkata", "Ahmedabad", "Kochi", "Coimbatore", "Thiruvananthapuram", "Madurai", "Kozhikode",
  "Visakhapatnam", "Mysuru",
];
const TEAM_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];
const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "full_time", label: "Full-time" },
  { value: "internship", label: "Internship" },
  { value: "contract", label: "Contract" },
  { value: "part_time", label: "Part-time" },
];
const WORK_MODES: { value: WorkMode; label: string }[] = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
      {children} {required && <span className="text-green-700">*</span>}
    </label>
  );
}

const selectCls =
  "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/40";
const textareaCls =
  "flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/40";

function MoreDetailsToggle({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-1.5 self-start text-xs font-bold text-green-700 transition-colors hover:text-green-700"
    >
      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

/**
 * Founder self-registration is gated behind a real session. The backend
 * verifies the *signed-in* email's domain against the company's website, so a
 * founder must first prove they control that mailbox (magic link or Google) —
 * typing an address at the right domain is no longer enough.
 */
export function RegisterCompanyForm() {
  const email = useIdentityStore((s) => s.email);
  if (!email) {
    return (
      <EmailGate
        title="List your startup"
        subtitle="Sign in with your company work email — we verify it against your website domain"
      />
    );
  }
  return <RegisterForm email={email} />;
}

function RegisterForm({ email }: { email: string }) {
  const router = useRouter();
  const setSelectedCompanyId = useMapSelectionStore((s) => s.setSelectedCompanyId);
  const [step, setStep] = useState<"company" | "role" | "done">("company");
  const [company, setCompany] = useState<Company | null>(null);
  const [showMoreCompanyDetails, setShowMoreCompanyDetails] = useState(false);
  const [showMoreRoleDetails, setShowMoreRoleDetails] = useState(false);

  const [form, setForm] = useState({
    name: "", websiteUrl: "", description: "", sector: "", stage: "",
    city: "Bengaluru", area: "", streetAddress: "", latitude: "", longitude: "",
    teamSize: "", foundedYear: "", linkedinUrl: "",
  });

  const companyMutation = useMutation({
    mutationFn: () =>
      registerCompany({
        name: form.name,
        websiteUrl: form.websiteUrl,
        description: form.description || undefined,
        sector: form.sector || undefined,
        stage: form.stage || undefined,
        city: form.city || undefined,
        area: form.area || undefined,
        streetAddress: form.streetAddress || undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        teamSize: form.teamSize || undefined,
        foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
        linkedinUrl: form.linkedinUrl || undefined,
      }),
    onSuccess: (data) => {
      setCompany(data);
      setStep("role");
    },
  });

  const [roleForm, setRoleForm] = useState({
    title: "", description: "", employmentType: "full_time" as EmploymentType,
    workMode: "" as WorkMode | "", salaryMin: "", salaryMax: "", applyUrl: "",
  });

  const jobMutation = useMutation({
    mutationFn: () =>
      registerJob({
        companyId: company!.id,
        title: roleForm.title,
        description: roleForm.description,
        employmentType: roleForm.employmentType,
        workMode: roleForm.workMode || undefined,
        salaryMin: roleForm.salaryMin ? Number(roleForm.salaryMin) : undefined,
        salaryMax: roleForm.salaryMax ? Number(roleForm.salaryMax) : undefined,
        applyUrl: roleForm.applyUrl || undefined,
      }),
    onSuccess: () => setStep("done"),
  });

  const viewOnMap = () => {
    if (company) setSelectedCompanyId(company.id);
    router.push("/");
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-14">
      <style jsx>{`
        @keyframes panelFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-green-600">
          <Rocket className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold text-gray-900">List your startup</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Get a pin on the map and start hiring. Verified instantly with your work email —
          no forms to wait on.
        </p>
      </div>

      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-500">
        <span className={cn("flex items-center gap-1", step !== "company" && "text-green-700")}>
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", step !== "company" ? "bg-green-500 text-white" : "bg-gray-900 text-white")}>1</span>
          Company
        </span>
        <span className="h-px w-6 bg-gray-200" />
        <span className={cn("flex items-center gap-1", step === "role" && "text-gray-900", step === "done" && "text-green-700")}>
          <span className={cn("flex h-5 w-5 items-center justify-center rounded-full", step === "role" ? "bg-gray-900 text-white" : step === "done" ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500")}>2</span>
          First role
        </span>
      </div>

      {step === "company" && (
        <form
          onSubmit={(e) => { e.preventDefault(); companyMutation.mutate(); }}
          className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.08)]"
        >
          <div>
            <FieldLabel>Verifying as</FieldLabel>
            <div className="flex items-center gap-2 rounded-lg border border-green-100 bg-green-50/60 px-3 py-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" />
              <span className="truncate text-sm font-semibold text-green-800">{email}</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Your email domain must match your company&apos;s website — that&apos;s how we verify it&apos;s really yours.
              Sign in with a different address if this isn&apos;t your work email.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FieldLabel required>Company name</FieldLabel>
              <Input required placeholder="Acme Technologies" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-span-2">
              <FieldLabel required>Website</FieldLabel>
              <Input required placeholder="acme.com" value={form.websiteUrl} onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })} />
            </div>
            <div className="col-span-2">
              <FieldLabel required>City</FieldLabel>
              <select className={selectCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <MoreDetailsToggle
            open={showMoreCompanyDetails}
            onToggle={() => setShowMoreCompanyDetails((v) => !v)}
            label={showMoreCompanyDetails ? "Hide extra details" : "Add sector, address, team size & more (optional)"}
          />

          {showMoreCompanyDetails && (
            <div className="grid grid-cols-2 gap-3" style={{ animation: "panelFadeIn 0.25s ease-out both" }}>
              <div>
                <FieldLabel>Sector</FieldLabel>
                <select className={selectCls} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
                  <option value="">Select…</option>
                  {SECTORS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel>Stage</FieldLabel>
                <select className={selectCls} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                  <option value="">Select…</option>
                  {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <FieldLabel>Area</FieldLabel>
                <Input placeholder="Koramangala" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Team size</FieldLabel>
                <select className={selectCls} value={form.teamSize} onChange={(e) => setForm({ ...form, teamSize: e.target.value })}>
                  <option value="">Select…</option>
                  {TEAM_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <FieldLabel>Office address</FieldLabel>
                <Input placeholder="100 Ft Road, Indiranagar, Bengaluru" value={form.streetAddress} onChange={(e) => setForm({ ...form, streetAddress: e.target.value })} />
              </div>

              <div>
                <FieldLabel>Exact latitude</FieldLabel>
                <Input type="number" step="any" placeholder="12.9716" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
              </div>
              <div>
                <FieldLabel>Exact longitude</FieldLabel>
                <Input type="number" step="any" placeholder="77.6412" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
              </div>
              <p className="col-span-2 -mt-2 text-xs text-gray-500">
                Right-click your office on{" "}
                <a href="https://www.google.com/maps" target="_blank" rel="noopener noreferrer" className="text-green-700 underline">
                  Google Maps
                </a>{" "}
                and copy the coordinates shown at the top. Skip this and we&apos;ll place your pin near the
                center of your city instead.
              </p>

              <div>
                <FieldLabel>Founded year</FieldLabel>
                <Input type="number" placeholder="2021" value={form.foundedYear} onChange={(e) => setForm({ ...form, foundedYear: e.target.value })} />
              </div>
              <div>
                <FieldLabel>LinkedIn</FieldLabel>
                <Input placeholder="linkedin.com/company/acme" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
              </div>

              <div className="col-span-2">
                <FieldLabel>About the company</FieldLabel>
                <textarea
                  className={textareaCls}
                  rows={3}
                  placeholder="What does your company do?"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
          )}

          {companyMutation.isError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {(companyMutation.error as Error).message}
            </div>
          )}

          <button
            type="submit"
            disabled={companyMutation.isPending}
            className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl disabled:opacity-60"
          >
            {companyMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Verifying…</>
            ) : (
              <><Building2 className="h-4 w-4" /> Verify & list company</>
            )}
          </button>
        </form>
      )}

      {step === "role" && company && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {company.name} is live on the map. Now add your first open role.
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); jobMutation.mutate(); }}
            className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.08)]"
          >
            <div>
              <FieldLabel required>Job title</FieldLabel>
              <Input required placeholder="Frontend Engineer" value={roleForm.title} onChange={(e) => setRoleForm({ ...roleForm, title: e.target.value })} />
            </div>
            <div>
              <FieldLabel required>Description</FieldLabel>
              <textarea
                required
                className={textareaCls}
                rows={4}
                placeholder="What will they work on? What are you looking for?"
                value={roleForm.description}
                onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>Work mode</FieldLabel>
              <select className={selectCls} value={roleForm.workMode} onChange={(e) => setRoleForm({ ...roleForm, workMode: e.target.value as WorkMode })}>
                <option value="">Not specified</option>
                {WORK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <MoreDetailsToggle
              open={showMoreRoleDetails}
              onToggle={() => setShowMoreRoleDetails((v) => !v)}
              label={showMoreRoleDetails ? "Hide extra details" : "Add employment type, salary & apply link (optional)"}
            />

            {showMoreRoleDetails && (
              <div className="grid grid-cols-2 gap-3" style={{ animation: "panelFadeIn 0.25s ease-out both" }}>
                <div>
                  <FieldLabel>Employment type</FieldLabel>
                  <select className={selectCls} value={roleForm.employmentType} onChange={(e) => setRoleForm({ ...roleForm, employmentType: e.target.value as EmploymentType })}>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel>Salary min (₹/yr)</FieldLabel>
                  <Input type="number" placeholder="800000" value={roleForm.salaryMin} onChange={(e) => setRoleForm({ ...roleForm, salaryMin: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>Salary max (₹/yr)</FieldLabel>
                  <Input type="number" placeholder="1500000" value={roleForm.salaryMax} onChange={(e) => setRoleForm({ ...roleForm, salaryMax: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Apply link</FieldLabel>
                  <Input placeholder="https://acme.com/careers/frontend-engineer" value={roleForm.applyUrl} onChange={(e) => setRoleForm({ ...roleForm, applyUrl: e.target.value })} />
                </div>
              </div>
            )}

            {jobMutation.isError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-600">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {(jobMutation.error as Error).message}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={viewOnMap}
                className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-500 transition-all hover:bg-gray-50"
              >
                Skip for now
              </button>
              <button
                type="submit"
                disabled={jobMutation.isPending}
                className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl disabled:opacity-60"
              >
                {jobMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Posting…</>
                ) : (
                  <><Check className="h-4 w-4" /> Post role</>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === "done" && company && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-100 bg-white p-8 text-center shadow-[0_8px_30px_rgba(15,23,42,0.08)]">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-50">
            <CheckCircle2 className="h-7 w-7 text-green-700" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">{company.name} is hiring on DECODING JOBS</p>
            <p className="mt-1 text-sm text-gray-500">Your company and role are both live on the map now.</p>
          </div>
          <button
            onClick={viewOnMap}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl"
          >
            <MapPin className="h-4 w-4" /> View on the map <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
