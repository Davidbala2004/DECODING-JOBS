"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Loader2,
  MapPin,
  Briefcase,
  User,
  RotateCcw,
  Paperclip,
  FileText,
  X,
  ChevronDown,
  PanelLeft,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useMapSelectionStore } from "@/lib/store";
import { useIdentityStore } from "@/lib/identityStore";
import {
  getJobById,
  sendChatMessage,
  listResumes,
  uploadResume,
  analyzeResume,
  getConversationMessages,
  appendChatMessage,
  type ChatMessage,
  type ChatJobResult,
  type ChatCompanyResult,
  type Resume,
} from "@/lib/api";
import { ResumeAnalysisCard } from "./ResumeAnalysisCard";
import { MarkdownMessage } from "./MarkdownMessage";

const STARTER_PROMPTS = [
  "Remote frontend roles in Bengaluru",
  "Fintech companies hiring in Chennai",
  "AI internships for freshers",
  "Help me prep for a backend engineer interview",
];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

/** Accepts a file by declared type, falling back to extension — some OS/browser
 * combos report an empty or generic type for a perfectly valid .docx. */
function isAcceptedResume(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function logoUrlFor(websiteUrl: string | null): string | null {
  if (!websiteUrl) return null;
  try {
    return `/api/logo?domain=${new URL(websiteUrl).hostname}`;
  } catch {
    return null;
  }
}

function getInitials(name: string): string {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  jobs?: ChatJobResult[];
  companies?: ChatCompanyResult[];
  resume?: Resume;
}

function JobResultCard({ job }: { job: ChatJobResult }) {
  const router = useRouter();
  const setSelectedCompanyId = useMapSelectionStore((s) => s.setSelectedCompanyId);
  const logo = logoUrlFor(job.website_url);

  return (
    <button
      type="button"
      onClick={() => {
        setSelectedCompanyId(job.company_id);
        router.push("/");
      }}
      className="flex w-full items-center gap-2.5 rounded-xl border border-gray-100 bg-white p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-green-200 hover:shadow-[0_6px_20px_rgba(22,163,74,0.16)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 text-xs font-bold text-green-700">
        {logo ? (
          <img src={logo} alt={job.company_name} className="h-full w-full object-contain p-1" />
        ) : (
          getInitials(job.company_name)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-gray-900">{job.title}</p>
        <p className="truncate text-xs text-gray-500">{job.company_name}</p>
      </div>
      {job.city && (
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-gray-500">
          <MapPin className="h-2.5 w-2.5" />
          {job.city}
        </span>
      )}
    </button>
  );
}

function CompanyResultCard({ company }: { company: ChatCompanyResult }) {
  const router = useRouter();
  const setSelectedCompanyId = useMapSelectionStore((s) => s.setSelectedCompanyId);
  const logo = logoUrlFor(company.website_url);

  return (
    <button
      type="button"
      onClick={() => {
        setSelectedCompanyId(company.id);
        router.push("/");
      }}
      className="flex w-full items-center gap-2.5 rounded-xl border border-gray-100 bg-white p-2.5 text-left transition-all hover:-translate-y-0.5 hover:border-green-200 hover:shadow-[0_6px_20px_rgba(22,163,74,0.16)]"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 text-xs font-bold text-green-700">
        {logo ? (
          <img src={logo} alt={company.name} className="h-full w-full object-contain p-1" />
        ) : (
          getInitials(company.name)
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-gray-900">{company.name}</p>
        <p className="truncate text-xs text-gray-500">{company.sector || "—"} · {company.city || "—"}</p>
      </div>
      {company.active_job_count > 0 && (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-bold text-green-700">
          <Briefcase className="h-2.5 w-2.5" />
          {company.active_job_count}
        </span>
      )}
    </button>
  );
}

export function ChatAssistant({
  jobId,
  conversationId,
  onConversationChange,
  onOpenHistory,
}: {
  jobId: number | null;
  conversationId: number | null;
  onConversationChange: (id: number | null) => void;
  onOpenHistory: () => void;
}) {
  const email = useIdentityStore((s) => s.email);
  const queryClient = useQueryClient();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [activeResumeId, setActiveResumeId] = useState<number | null>(null);
  const [resumeMenuOpen, setResumeMenuOpen] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resumeMenuRef = useRef<HTMLDivElement>(null);
  // False once the reader scrolls up away from the newest message. While it is
  // false the view stops auto-following, so a reply never yanks the page out
  // from under someone re-reading an earlier answer.
  const stickToBottomRef = useRef(true);
  const seededJobRef = useRef<number | null>(null);
  // Tracks the last conversationId *we* produced (new chat / first message) —
  // lets the load-history effect tell "the sidebar picked a different one"
  // apart from "the id we just got back from our own request".
  const ownConversationIdRef = useRef<number | null>(null);

  const { data: contextJob } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobById(jobId as number),
    enabled: jobId !== null,
  });

  const { data: resumes } = useQuery({
    queryKey: ["resumes", email],
    queryFn: () => listResumes(),
    enabled: !!email,
  });
  const activeResume = resumes?.find((r) => r.id === activeResumeId) ?? null;

  // Load a conversation's turns when the sidebar selects one (or clear on "New chat").
  useEffect(() => {
    if (conversationId === ownConversationIdRef.current) return;

    if (conversationId === null) {
      setTurns([]);
      setActiveResumeId(null);
      ownConversationIdRef.current = null;
      return;
    }

    if (!email) return;
    let cancelled = false;
    setLoadingHistory(true);
    getConversationMessages(conversationId)
      .then((messages) => {
        if (cancelled) return;
        setTurns(
          messages.map((m) => ({
            role: m.role,
            content: m.content,
            jobs: m.jobs.length ? m.jobs : undefined,
            companies: m.companies.length ? m.companies : undefined,
            resume: m.resume ?? undefined,
          }))
        );
        const lastResume = [...messages].reverse().find((m) => m.resume)?.resume;
        setActiveResumeId(lastResume ? lastResume.id : null);
        ownConversationIdRef.current = conversationId;
      })
      .finally(() => !cancelled && setLoadingHistory(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId, email]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (resumeMenuRef.current && !resumeMenuRef.current.contains(e.target as Node)) {
        setResumeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const chatMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (response) => {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: response.reply, jobs: response.jobs, companies: response.companies },
      ]);
      if (response.conversation_id !== null && response.conversation_id !== conversationId) {
        ownConversationIdRef.current = response.conversation_id;
        onConversationChange(response.conversation_id);
        queryClient.invalidateQueries({ queryKey: ["chatConversations", email] });
      }
    },
    onError: () => {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong reaching the assistant — please try again." },
      ]);
    },
  });

  const uploadMutation = useMutation({
    mutationFn: uploadResume,
    onError: (err: Error) => {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: err.message || "Couldn't read that file — try a PDF or DOCX under 5MB." },
      ]);
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeResume,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resumes", email] }),
  });

  const isBusy = chatMutation.isPending || uploadMutation.isPending || analyzeMutation.isPending || loadingHistory;

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;

    const nextTurns: Turn[] = [...turns, { role: "user", content: trimmed }];
    setTurns(nextTurns);
    setInput("");
    // Sending is an explicit request to follow the conversation again.
    stickToBottomRef.current = true;

    const history: ChatMessage[] = nextTurns.map((t) => ({ role: t.role, content: t.content }));
    chatMutation.mutate({ messages: history, resumeId: activeResumeId, jobId, conversationId });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || isBusy) return;
    if (!email) {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: "Sign in first and I can read your resume — then score it and tailor it to a role." },
      ]);
      return;
    }
    if (!isAcceptedResume(file)) {
      setTurns((prev) => [...prev, { role: "assistant", content: "Only PDF and DOCX resumes are supported." }]);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setTurns((prev) => [...prev, { role: "assistant", content: "Resume must be 5MB or smaller." }]);
      return;
    }

    const attachContent = `📎 Attached ${file.name}`;
    setTurns((prev) => [...prev, { role: "user", content: attachContent }]);

    try {
      const resume = await uploadMutation.mutateAsync({ file });
      setActiveResumeId(resume.id);
      queryClient.invalidateQueries({ queryKey: ["resumes", email] });

      let convId = conversationId;
      const appended = await appendChatMessage({
        conversationId: convId,
        role: "user",
        content: attachContent,
      });
      if (appended.conversation_id !== convId) {
        convId = appended.conversation_id;
        ownConversationIdRef.current = convId;
        onConversationChange(convId);
        queryClient.invalidateQueries({ queryKey: ["chatConversations", email] });
      }

      const analyzed = await analyzeMutation.mutateAsync({ resumeId: resume.id, jobId: jobId ?? undefined });
      setTurns((prev) => [...prev, { role: "assistant", content: "Here's your ATS analysis:", resume: analyzed }]);
      await appendChatMessage({
        conversationId: convId,
        role: "assistant",
        content: "Here's your ATS analysis:",
        resumeId: analyzed.id,
      });
    } catch {
      // Failures already surfaced via the mutations' own onError handlers.
    }
  };

  // Auto-seed a prep conversation when arriving via "Prep for this role."
  useEffect(() => {
    if (contextJob && seededJobRef.current !== contextJob.id && turns.length === 0) {
      seededJobRef.current = contextJob.id;
      send(`Help me prepare for the ${contextJob.title} role at ${contextJob.company.name}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextJob]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, isBusy]);

  // The composer grows with the prompt instead of clipping a single line —
  // prompts here are often a paragraph of context. Capped at 160px so a pasted
  // essay cannot push the conversation off screen.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const hasStarted = turns.length > 0;

  const composer = (
    <div className="mx-auto w-full max-w-3xl">
      {activeResume && (
        <div className="mb-2 flex items-center gap-2">
          <div className="relative" ref={resumeMenuRef}>
            {/* Two sibling buttons, not a button nested in a button — the
                latter is invalid HTML and trips React's hydration checks. */}
            <div className="flex items-center gap-0.5 rounded-full bg-green-50 text-xs font-semibold text-green-700">
              <button
                type="button"
                onClick={() => setResumeMenuOpen((v) => !v)}
                title="Choose resume"
                className="flex items-center gap-1.5 rounded-l-full py-1.5 pl-3 pr-1 transition-colors hover:bg-green-100"
              >
                <FileText className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{activeResume.filename}</span>
                {(resumes?.length ?? 0) > 1 && (
                  <ChevronDown className={cn("h-3 w-3 transition-transform", resumeMenuOpen && "rotate-180")} />
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveResumeId(null)}
                aria-label="Detach resume"
                title="Detach resume"
                className="mr-1 rounded-full p-1 transition-colors hover:bg-green-200/60"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
            {resumeMenuOpen && (resumes?.length ?? 0) > 1 && (
              <div
                className="absolute bottom-full left-0 z-20 mb-1.5 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-[0_12px_40px_rgba(15,23,42,0.14)]"
                style={{ animation: "panelFadeIn 0.15s ease-out" }}
              >
                {resumes?.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setActiveResumeId(r.id);
                      setResumeMenuOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors",
                      r.id === activeResumeId ? "bg-green-50 font-semibold text-green-700" : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    <span className="truncate">{r.filename}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isBusy}
          title="Attach your resume"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-all hover:border-green-200 hover:bg-green-50 hover:text-green-700 disabled:opacity-40"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter starts a new line — what every chat
            // product does, and the only way to write a multi-line prompt.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          // Kept short on purpose: the composer textarea is only ~220px wide
          // at 360px, so any longer placeholder wraps and looks broken against
          // the one-row height. The full hint ("…or interview prep") already
          // lives in the header subtitle, so nothing is lost.
          placeholder="Ask about jobs…"
          className="scroll-thin min-h-11 flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-3 text-sm leading-relaxed outline-none transition-all focus:border-green-300 focus:bg-white focus:ring-4 focus:ring-green-400/15"
        />
        <button
          type="submit"
          disabled={isBusy || !input.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md shadow-green-500/20 transition-all hover:shadow-lg active:scale-95 disabled:opacity-40"
        >
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <style jsx global>{`
        @keyframes turnFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
        @keyframes panelFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes gaugeSpinIn {
          from { opacity: 0; transform: scale(0.85) rotate(-30deg); }
          to { opacity: 1; transform: scale(1) rotate(0deg); }
        }
        @keyframes heroFadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Header */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-emerald-100 bg-gradient-to-r from-white to-green-50/40 px-3 py-3 sm:px-5">
        {email && (
          <button
            type="button"
            onClick={onOpenHistory}
            title="Conversation history"
            aria-label="Conversation history"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-all hover:bg-green-50 hover:text-green-700 lg:hidden"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-md shadow-green-500/20">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900">AI Job Search Assistant</p>
          {contextJob ? (
            <p className="truncate text-xs text-green-700">
              Prepping for {contextJob.title} @ {contextJob.company.name}
            </p>
          ) : (
            <p className="truncate text-xs text-gray-500">Ask about real jobs, companies, or interview prep</p>
          )}
        </div>
        {hasStarted && (
          <button
            type="button"
            onClick={() => onConversationChange(null)}
            title="Start a new chat"
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 shadow-sm transition-all hover:bg-green-50 hover:text-green-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New chat</span>
          </button>
        )}
      </div>

      {!hasStarted ? (
        // Claude/ChatGPT-style empty state: greeting + composer centered together.
        <div
          className="scroll-thin flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-6 sm:py-10"
          style={{ animation: "heroFadeIn 0.35s ease-out both" }}
        >
          {/* my-auto, not justify-center. justify-center on a flex column that
              overflows clips the *top* — on a short phone the greeting and the
              attach button were cut off with no way to scroll to them. */}
          <div className="my-auto flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 shadow-inner">
                <Sparkles className="h-7 w-7 text-green-700" />
              </div>
              <div>
                <p className="text-base font-semibold text-gray-900">What are you looking for?</p>
                <p className="mt-1 text-xs text-gray-500">
                  Ask about real jobs and companies, or attach your resume for feedback.
                </p>
              </div>
            </div>
            {composer}
            <div className="flex flex-wrap justify-center gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-all hover:border-green-200 hover:bg-green-50 hover:text-green-700"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Messages */}
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottomRef.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
            className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-6"
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {turns.map((turn, i) => (
                <div
                  key={i}
                  className={cn("flex gap-2.5", turn.role === "user" ? "flex-row-reverse" : "flex-row")}
                  style={{ animation: "turnFadeIn 0.25s ease-out both" }}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      turn.role === "user" ? "bg-gray-100 text-gray-500" : "bg-green-600 text-white"
                    )}
                  >
                    {turn.role === "user" ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </div>
                  <div
                    className={cn(
                      "flex flex-col gap-2",
                      turn.role === "user"
                        ? "max-w-[85%] items-end"
                        // min-w-0 + flex-1, not max-w-[95%]. The avatar beside this
                        // column already takes ~38px, so "95% of the row" plus the
                        // avatar overflowed the container. At desktop width 95% of
                        // 768px still fit, so it went unnoticed — on a phone it
                        // pushed the job cards off the right edge.
                        : "min-w-0 flex-1 items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-xl px-3.5 py-2.5 shadow-sm",
                        turn.role === "user"
                          ? "whitespace-pre-wrap bg-green-600 text-sm leading-relaxed text-white"
                          : "border border-gray-100 bg-white text-gray-700"
                      )}
                    >
                      {turn.role === "user" ? turn.content : <MarkdownMessage content={turn.content} />}
                    </div>
                    {turn.resume && <ResumeAnalysisCard resume={turn.resume} />}
                    {turn.jobs && turn.jobs.length > 0 && (
                      <div className="flex w-full flex-col gap-1.5">
                        {turn.jobs.map((job) => (
                          <JobResultCard key={job.id} job={job} />
                        ))}
                      </div>
                    )}
                    {turn.companies && turn.companies.length > 0 && (
                      <div className="flex w-full flex-col gap-1.5">
                        {turn.companies.map((company) => (
                          <CompanyResultCard key={company.id} company={company} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isBusy && (
                <div className="flex gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex items-center gap-1 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-green-400"
                        style={{ animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite` }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          {/* paddingBottom carries env(safe-area-inset-bottom) so the composer
              clears the iOS home indicator instead of sitting under it. */}
          <div
            className="shrink-0 border-t border-gray-100 bg-white px-3 pt-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            {composer}
          </div>
        </>
      )}
    </div>
  );
}
