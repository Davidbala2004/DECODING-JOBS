"use client";

import { CheckCircle2, XCircle, Lightbulb, Tag } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Resume } from "@/lib/api";

/**
 * Renders one resume's ATS analysis as a rich card inline in the chat —
 * the assistant "reads" the attached resume and responds with this, the
 * same way Claude/ChatGPT render a file's analysis as part of the reply
 * rather than in a separate always-visible panel.
 */

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 75 ? "#16a34a" : score >= 50 ? "#eab308" : "#ef4444";
  return (
    <div
      className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(${color} ${score * 3.6}deg, #f1f5f9 0deg)`,
        animation: "gaugeSpinIn 0.6s ease-out both",
      }}
    >
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white shadow-inner">
        <span className="text-base font-extrabold text-gray-800">{score}</span>
      </div>
    </div>
  );
}

function SuggestionSection({
  icon: Icon,
  label,
  labelClassName,
  items,
  itemClassName,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  labelClassName: string;
  items: string[];
  itemClassName: string;
  delay: number;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ animation: `panelFadeIn 0.3s ease-out ${delay}s both` }}>
      <p className={cn("mb-1.5 flex items-center gap-1 text-[11.5px] font-bold uppercase tracking-wider", labelClassName)}>
        <Icon className="h-3 w-3" /> {label}
      </p>
      <ul className="flex flex-col gap-1">
        {items.map((s, i) => (
          <li key={i} className={cn("rounded-lg px-2.5 py-1.5 text-[12.5px] leading-relaxed text-gray-700", itemClassName)}>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResumeAnalysisCard({ resume }: { resume: Resume }) {
  return (
    <div
      className="w-full rounded-2xl border border-gray-100 bg-white p-3.5 shadow-[0_2px_8px_rgba(15,23,42,0.06)]"
      style={{ animation: "turnFadeIn 0.3s ease-out both" }}
    >
      {resume.ats_score !== null && (
        <div className="flex items-center gap-3">
          <ScoreGauge score={resume.ats_score} />
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-bold uppercase tracking-wider text-gray-400">ATS Score</p>
            <p className="mt-0.5 text-[12px] leading-snug text-gray-600">{resume.ats_summary}</p>
          </div>
        </div>
      )}

      {resume.ats_suggestions && (
        <div className="mt-3 flex flex-col gap-3 border-t border-gray-50 pt-3">
          <SuggestionSection
            icon={CheckCircle2}
            label="Strengths"
            labelClassName="text-green-600"
            items={resume.ats_suggestions.strengths}
            itemClassName="bg-green-50/60"
            delay={0.05}
          />
          <SuggestionSection
            icon={XCircle}
            label="Weaknesses"
            labelClassName="text-red-400"
            items={resume.ats_suggestions.weaknesses}
            itemClassName="bg-red-50/60"
            delay={0.1}
          />
          <SuggestionSection
            icon={Lightbulb}
            label="Suggestions"
            labelClassName="text-green-600"
            items={resume.ats_suggestions.suggestions}
            itemClassName="bg-gray-50"
            delay={0.15}
          />
          {resume.ats_suggestions.missing_keywords.length > 0 && (
            <div style={{ animation: "panelFadeIn 0.3s ease-out 0.2s both" }}>
              <p className="mb-1.5 flex items-center gap-1 text-[11.5px] font-bold uppercase tracking-wider text-gray-500">
                <Tag className="h-3 w-3" /> Missing Keywords
              </p>
              <div className="flex flex-wrap gap-1">
                {resume.ats_suggestions.missing_keywords.map((k, i) => (
                  <span key={i} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11.5px] font-medium text-gray-500">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
