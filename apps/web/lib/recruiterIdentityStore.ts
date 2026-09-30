import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RecruiterIdentityStore {
  companyId: number | null;
  companyName: string | null;
  setRecruiterCompany: (companyId: number, companyName: string) => void;
  clearRecruiterCompany: () => void;
}

/**
 * Which company a signed-in user is acting as a recruiter for — separate
 * from useIdentityStore only because "which company" is its own concept on
 * top of identity, not a second identity. The actual session token (proof
 * of who's signed in) lives in useIdentityStore and is shared: a recruiter
 * signs in exactly the same way a job seeker does (magic link / Google),
 * then /recruiters/identify resolves the company for that same session.
 */
export const useRecruiterIdentityStore = create<RecruiterIdentityStore>()(
  persist(
    (set) => ({
      companyId: null,
      companyName: null,
      setRecruiterCompany: (companyId, companyName) => set({ companyId, companyName }),
      clearRecruiterCompany: () => set({ companyId: null, companyName: null }),
    }),
    { name: "decoding-jobs-recruiter-identity" }
  )
);
