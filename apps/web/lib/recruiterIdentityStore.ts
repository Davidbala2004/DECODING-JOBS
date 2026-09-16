import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RecruiterIdentityStore {
  email: string | null;
  companyId: number | null;
  companyName: string | null;
  setRecruiterIdentity: (email: string, companyId: number, companyName: string) => void;
  clearRecruiterIdentity: () => void;
}

/**
 * Separate from useIdentityStore (job-seeker identity) — a recruiter's
 * session is verified against a registered company's email domain, not a
 * plain email, so it's kept in its own localStorage key. The same person
 * could plausibly be signed in as both a job seeker and a recruiter.
 */
export const useRecruiterIdentityStore = create<RecruiterIdentityStore>()(
  persist(
    (set) => ({
      email: null,
      companyId: null,
      companyName: null,
      setRecruiterIdentity: (email, companyId, companyName) => set({ email, companyId, companyName }),
      clearRecruiterIdentity: () => set({ email: null, companyId: null, companyName: null }),
    }),
    { name: "decoding-jobs-recruiter-identity" }
  )
);
