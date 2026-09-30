import { create } from "zustand";
import { persist } from "zustand/middleware";

interface IdentityStore {
  email: string | null;
  userId: number | null;
  /** Bearer session token from a verified magic-link click or Google sign-in —
   * attached to every authenticated request by lib/api.ts. */
  sessionToken: string | null;
  /** u-{token}@{domain} to forward interview emails to, or null if not configured yet. */
  forwardingAddress: string | null;
  setIdentity: (email: string, userId: number, sessionToken: string, forwardingAddress: string | null) => void;
  clearIdentity: () => void;
}

/**
 * Real identity: a session token issued after a magic-link click or Google
 * sign-in (see app/auth/verify and EmailGate.tsx) — replaces the earlier
 * "a stored email is the whole identity" model. Persisted to localStorage so
 * it survives a refresh/reopen; a 401 anywhere clears it (see lib/api.ts).
 */
export const useIdentityStore = create<IdentityStore>()(
  persist(
    (set) => ({
      email: null,
      userId: null,
      sessionToken: null,
      forwardingAddress: null,
      setIdentity: (email, userId, sessionToken, forwardingAddress) =>
        set({ email, userId, sessionToken, forwardingAddress }),
      clearIdentity: () => set({ email: null, userId: null, sessionToken: null, forwardingAddress: null }),
    }),
    { name: "decoding-jobs-identity" }
  )
);
