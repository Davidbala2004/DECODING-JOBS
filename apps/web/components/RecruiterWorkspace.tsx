"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Building2, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useRecruiterIdentityStore } from "@/lib/recruiterIdentityStore";
import { recruiterIdentify } from "@/lib/api";
import { CandidateSearchPanel } from "@/components/CandidateSearchPanel";

function RecruiterGate() {
  const [email, setEmail] = useState("");
  const setRecruiterIdentity = useRecruiterIdentityStore((s) => s.setRecruiterIdentity);

  const mutation = useMutation({
    mutationFn: () => recruiterIdentify(email.trim()),
    onSuccess: (identity) => setRecruiterIdentity(email.trim(), identity.company_id, identity.company_name),
  });

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6" style={{ animation: "cardFadeIn 0.4s ease-out both" }}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/25">
        <Building2 className="h-6 w-6 text-white" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-bold text-gray-900">Search candidates</h1>
        <p className="mt-1 max-w-xs text-sm text-gray-500">
          Enter your work email — we verify it against your registered company&apos;s domain.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
        className="flex w-full max-w-xs flex-col gap-2"
      >
        <Input
          type="email"
          required
          placeholder="you@yourcompany.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          type="submit"
          disabled={mutation.isPending || !email.trim()}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-green-500/25 transition-all hover:shadow-xl disabled:opacity-60"
        >
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Verify company
        </button>
      </form>

      {mutation.isError && (
        <div className="flex max-w-xs items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs text-red-600">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {(mutation.error as Error).message || "No registered company matches this email."}
        </div>
      )}

      <p className="max-w-xs text-center text-[12.5px] text-gray-400">
        Haven&apos;t registered your company yet?{" "}
        <a href="/register" className="font-semibold text-green-600 hover:underline">
          Do that first
        </a>
        .
      </p>
    </div>
  );
}

export function RecruiterWorkspace() {
  const email = useRecruiterIdentityStore((s) => s.email);

  if (!email) return <RecruiterGate />;

  return <CandidateSearchPanel />;
}
