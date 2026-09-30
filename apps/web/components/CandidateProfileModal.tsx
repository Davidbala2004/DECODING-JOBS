"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Github, Linkedin, Code2, Loader2, Mail, X, XCircle, Lightbulb } from "lucide-react";

import { unlockCandidate } from "@/lib/api";
import { formatExperience, noticePeriodLabel } from "@/components/ProfileWorkspace";

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#eab308" : "#ef4444";
  return (
    <div
      className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${color} ${score * 3.6}deg, #f1f5f9 0deg)` }}
    >
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white shadow-inner">
        <span className="text-base font-extrabold text-gray-800">{score}</span>
      </div>
    </div>
  );
}

function LinkRow({ icon: Icon, url, verified }: { icon: React.ElementType; url: string | null; verified: boolean }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:border-green-200 hover:bg-green-50/60"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate flex-1">{url}</span>
      {verified ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
      ) : (
        <span className="shrink-0 text-[10px] font-bold uppercase text-gray-300">Unverified</span>
      )}
      <ExternalLink className="h-3 w-3 shrink-0 text-gray-300" />
    </a>
  );
}

export function CandidateProfileModal({ candidateId, onClose }: { candidateId: number; onClose: () => void }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => unlockCandidate({ candidateId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["candidateSearch"] }),
  });
  const { mutate } = mutation;

  useEffect(() => {
    mutate();
  }, [mutate]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="scroll-thin max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"
        style={{ animation: "cardFadeIn 0.25s ease-out both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-50 bg-white/95 px-5 py-3 backdrop-blur-sm">
          <h2 className="text-sm font-bold text-gray-900">Candidate profile</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          {mutation.isPending && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin text-green-500" /> Unlocking profile…
            </div>
          )}

          {mutation.isError && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-xs text-red-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {(mutation.error as Error).message}
            </div>
          )}

          {mutation.data && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">{mutation.data.full_name}</h3>
                <a href={`mailto:${mutation.data.email}`} className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-green-600 hover:underline">
                  <Mail className="h-3 w-3" /> {mutation.data.email}
                </a>
              </div>

              {mutation.data.target_roles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {mutation.data.target_roles.map((role) => (
                    <span key={role} className="rounded-full bg-green-50 px-2.5 py-1 text-[12.5px] font-semibold text-green-700">
                      {role}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[11.5px] font-bold uppercase text-gray-400">Experience</p>
                  <p className="mt-0.5 font-semibold text-gray-700">{formatExperience(mutation.data.experience_years)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[11.5px] font-bold uppercase text-gray-400">Work mode</p>
                  <p className="mt-0.5 font-semibold capitalize text-gray-700">{mutation.data.preferred_work_mode || "No preference"}</p>
                </div>
                <div className="col-span-2 rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[11.5px] font-bold uppercase text-gray-400">Notice period</p>
                  <p className="mt-0.5 font-semibold text-gray-700">
                    {noticePeriodLabel(mutation.data.notice_period) || "Not specified"}
                  </p>
                </div>
              </div>

              {mutation.data.skills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {mutation.data.skills.map((skill) => (
                    <span key={skill} className="rounded-full bg-gray-50 px-2 py-0.5 text-[11.5px] font-medium text-gray-500">
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <LinkRow icon={Github} url={mutation.data.github_url} verified={mutation.data.github_verified} />
                <LinkRow icon={Linkedin} url={mutation.data.linkedin_url} verified={mutation.data.linkedin_verified} />
                <LinkRow icon={Code2} url={mutation.data.leetcode_url} verified={mutation.data.leetcode_verified} />
              </div>

              {mutation.data.ats_score !== null && (
                <div className="rounded-2xl border border-gray-100 p-3.5">
                  <div className="flex items-center gap-3">
                    <ScoreGauge score={mutation.data.ats_score} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11.5px] font-bold uppercase tracking-wider text-gray-400">Resume ATS Score</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-gray-600">{mutation.data.ats_summary}</p>
                    </div>
                  </div>
                  {mutation.data.ats_suggestions?.strengths && mutation.data.ats_suggestions.strengths.length > 0 && (
                    <div className="mt-3 border-t border-gray-50 pt-3">
                      <p className="mb-1.5 flex items-center gap-1 text-[11.5px] font-bold uppercase tracking-wider text-green-600">
                        <Lightbulb className="h-3 w-3" /> Strengths
                      </p>
                      <ul className="flex flex-col gap-1">
                        {mutation.data.ats_suggestions.strengths.map((s, i) => (
                          <li key={i} className="rounded-lg bg-green-50/60 px-2.5 py-1.5 text-[12.5px] leading-relaxed text-gray-700">
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {mutation.data.resume_id === null && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
                  <XCircle className="h-3.5 w-3.5 shrink-0" /> This candidate hasn&apos;t uploaded a resume yet.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
