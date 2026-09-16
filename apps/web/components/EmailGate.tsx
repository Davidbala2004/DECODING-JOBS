"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";

import { useIdentityStore } from "@/lib/identityStore";
import { googleAuth } from "@/lib/api";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: { theme?: string; size?: string; shape?: string; width?: string }
          ) => void;
        };
      };
    };
  }
}

/**
 * Sign in with Google — the whole identity model underneath is still "an
 * email is the whole account" (Application Tracker, AI Assistant, 1-Click
 * Apply all key off it unchanged); this just replaces *typing* an email
 * with a verified one from Google, so nobody can accidentally (or
 * deliberately) sign in as someone else's address.
 */
export function EmailGate({
  title = "Sign in to continue",
  subtitle = "We use your Google email as your account — no separate password to set up",
}: {
  title?: string;
  subtitle?: string;
}) {
  const setIdentity = useIdentityStore((s) => s.setIdentity);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [gsiReady, setGsiReady] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const mutation = useMutation({
    mutationFn: googleAuth,
    onSuccess: (user) => setIdentity(user.email, user.id, user.forwarding_address),
  });

  useEffect(() => {
    if (!gsiReady || !clientId || !buttonRef.current || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => mutation.mutate(response.credential),
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      width: "280",
    });
    // mutation is a new object every render; only re-init when the script
    // finishes loading or the client ID changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gsiReady, clientId]);

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 p-6"
      style={{ animation: "cardFadeIn 0.4s ease-out both" }}
    >
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setGsiReady(true)}
      />
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 shadow-inner">
        <svg viewBox="0 0 24 24" className="h-6 w-6">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
      </div>

      {!clientId ? (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Google Sign-In isn&apos;t configured yet.
        </div>
      ) : (
        <>
          <div ref={buttonRef} className="min-h-[44px]" />
          {mutation.isPending && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing in…
            </div>
          )}
          {mutation.isError && (
            <p className="max-w-xs text-center text-xs text-red-500">{(mutation.error as Error).message}</p>
          )}
        </>
      )}
    </div>
  );
}
