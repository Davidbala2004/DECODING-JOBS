"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Building2, Loader2 } from "lucide-react";

import { useIdentityStore } from "@/lib/identityStore";
import { useRecruiterIdentityStore } from "@/lib/recruiterIdentityStore";
import { recruiterIdentify } from "@/lib/api";
import { EmailGate } from "@/components/EmailGate";
import { CandidateSearchPanel } from "@/components/CandidateSearchPanel";

// Resolves which company a signed-in user is a verified recruiter for —
// runs once real identity exists (a session from EmailGate), never before,
// since recruiters.py's domain-match check now runs against a
// session-verified email, not a client-supplied string anyone could type.
function CompanyVerification() {
  const setRecruiterCompany = useRecruiterIdentityStore((s) => s.setRecruiterCompany);

  const mutation = useMutation({
    mutationFn: () => recruiterIdentify(),
    onSuccess: (identity) => setRecruiterCompany(identity.company_id, identity.company_name),
  });
  const { mutate } = mutation;

  useEffect(() => {
    mutate();
  }, [mutate]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-6" style={{ animation: "cardFadeIn 0.4s ease-out both" }}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600">
        <Building2 className="h-6 w-6 text-white" />
      </div>

      {mutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Verifying your company…
        </div>
      )}

      {mutation.isError && (
        <>
          <div className="text-center">
            <h1 className="text-lg font-bold text-gray-900">No registered company found</h1>
            <p className="mt-1 max-w-xs text-sm text-gray-500">
              We verify recruiters by matching your signed-in email&apos;s domain against a registered company&apos;s website.
            </p>
          </div>
          <div className="flex max-w-xs items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs text-red-600">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {(mutation.error as Error).message}
          </div>
          <p className="max-w-xs text-center text-[12.5px] text-gray-400">
            Haven&apos;t registered your company yet?{" "}
            <Link href="/register" className="font-semibold text-green-600 hover:underline">
              Do that first
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}

export function RecruiterWorkspace() {
  const email = useIdentityStore((s) => s.email);
  const companyId = useRecruiterIdentityStore((s) => s.companyId);

  if (!email) {
    return <EmailGate title="Search candidates" subtitle="Sign in with your work email — we verify it against your registered company" />;
  }

  if (companyId === null) return <CompanyVerification />;

  return <CandidateSearchPanel />;
}
