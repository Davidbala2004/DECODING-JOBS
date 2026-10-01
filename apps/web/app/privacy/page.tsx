import type { Metadata } from "next";

import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Privacy Policy — DECODING JOBS",
  description: "What data DECODING JOBS collects, why, how long it is kept, and how to remove it.",
};

/**
 * A plain-language privacy policy. This is a good-faith baseline for an app
 * that stores personal data (resumes, emails) — have it reviewed by counsel
 * before a public, commercial launch, and keep it in sync with what the
 * endpoints actually do.
 */
export default function PrivacyPage() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <TopNav />
      <main className="scroll-thin flex-1 overflow-y-auto bg-gradient-to-b from-green-50/40 to-white">
        <article className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Privacy Policy</h1>
          <p className="mt-1.5 text-sm text-gray-500">Last updated: 1 October 2026</p>

          <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-gray-600">
            <section>
              <h2 className="mb-1.5 text-sm font-bold text-gray-900">What we collect</h2>
              <ul className="ml-4 list-disc space-y-1">
                <li>Your email address, and your name once you sign in.</li>
                <li>Job-search preferences you choose to save (roles, cities, notice period, links).</li>
                <li>Resumes you upload, and their extracted text, so we can score and rewrite them.</li>
                <li>Applications you save or submit, and conversations you have with the AI Assistant.</li>
                <li>Emails you forward to your personal tracking address, so we can update your board.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-1.5 text-sm font-bold text-gray-900">How we use it</h2>
              <p>
                Only to run the product: to show you matching jobs and companies, to personalise search and
                the AI Assistant, and to let a verified recruiter find you — only if you leave the
                &ldquo;Visible to recruiters&rdquo; setting on. We do not sell your data.
              </p>
            </section>

            <section>
              <h2 className="mb-1.5 text-sm font-bold text-gray-900">Third parties</h2>
              <p>
                Resumes and chat messages are processed by an LLM provider to produce scores and suggestions.
                Sign-in uses Google if you choose it. Emails are sent through our transactional email provider.
                Company logos are proxied from a public favicon service.
              </p>
            </section>

            <section>
              <h2 className="mb-1.5 text-sm font-bold text-gray-900">Keeping and deleting</h2>
              <p>
                Sign-in links expire in 15 minutes and sessions in 30 days. You can download everything we hold
                and permanently delete your account at any time from{" "}
                <a href="/profile" className="font-semibold text-green-700 hover:underline">your preferences page</a>.
                Deletion is immediate and removes your profile, resumes, applications, and chat history.
              </p>
            </section>

            <section>
              <h2 className="mb-1.5 text-sm font-bold text-gray-900">Contact</h2>
              <p>Questions about your data? Reach out through the repository&apos;s issue tracker.</p>
            </section>
          </div>
        </article>
      </main>
    </div>
  );
}
