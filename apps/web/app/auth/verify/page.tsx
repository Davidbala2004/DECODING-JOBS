"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { useIdentityStore } from "@/lib/identityStore";
import { verifyMagicLink } from "@/lib/api";

function VerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setIdentity = useIdentityStore((s) => s.setIdentity);
  const [status, setStatus] = useState<"verifying" | "error">("verifying");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setError("This link is missing its token.");
      return;
    }

    verifyMagicLink(token)
      .then((session) => {
        setIdentity(session.user.email, session.user.id, session.session_token, session.user.forwarding_address);
        router.replace("/");
      })
      .catch((err: Error) => {
        setStatus("error");
        setError(err.message);
      });
    // Only run once, on mount — searchParams/router/setIdentity are stable enough here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-white p-6">
      {status === "verifying" ? (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-green-700" />
          <p className="text-sm text-gray-500">Signing you in…</p>
        </>
      ) : (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <p className="text-sm font-semibold text-gray-900">Couldn&apos;t sign you in</p>
          <p className="max-w-xs text-center text-xs text-gray-500">{error}</p>
          <Link href="/" className="mt-2 flex items-center gap-1.5 text-xs font-bold text-green-700 hover:underline">
            <CheckCircle2 className="h-3.5 w-3.5" /> Back to the map
          </Link>
        </>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-green-700" />
        </div>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
