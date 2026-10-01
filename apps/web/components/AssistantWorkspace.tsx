"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, X } from "lucide-react";

import { useIdentityStore } from "@/lib/identityStore";
import { ChatAssistant } from "./ChatAssistant";
import { ChatHistorySidebar } from "./ChatHistorySidebar";

/** Shown in the sidebar slot when signed out — chat itself works anonymously,
 * only history and resume upload need an account. */
function SignInPromo() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50">
        <Sparkles className="h-5 w-5 text-green-600" />
      </div>
      <p className="text-[13px] font-semibold text-gray-800">Sign in to save your chats</p>
      <p className="text-[12px] leading-relaxed text-gray-400">
        You can chat right now — sign in to keep conversations across visits and attach a resume.
      </p>
    </div>
  );
}

/**
 * Full-width chat with a conversation-history sidebar — the layout every
 * product in this category (ChatGPT, Claude) uses. Resume upload lives
 * inside the chat itself (attach in the composer), not a separate panel.
 */
export function AssistantWorkspace() {
  const email = useIdentityStore((s) => s.email);
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");
  const jobIdNum = jobId ? Number(jobId) : null;

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="relative flex min-h-0 w-full flex-1">
      <style jsx global>{`
        @keyframes sidebarSlideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Desktop: always-visible sidebar when signed in, sign-in nudge otherwise */}
      <div className="hidden h-full w-64 shrink-0 border-r border-gray-100 lg:block">
        {email ? (
          <ChatHistorySidebar
            selectedId={conversationId}
            onSelect={setConversationId}
            onNew={() => setConversationId(null)}
          />
        ) : (
          <SignInPromo />
        )}
      </div>

      {/* Mobile: slide-in drawer (signed in only — nothing to list otherwise) */}
      {mobileSidebarOpen && email && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            style={{ animation: "backdropFadeIn 0.2s ease-out" }}
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div
            className="absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col bg-white shadow-2xl"
            style={{ animation: "sidebarSlideIn 0.25s cubic-bezier(0.32,0.72,0,1)" }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">History</span>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <ChatHistorySidebar
                selectedId={conversationId}
                onSelect={(id) => {
                  setConversationId(id);
                  setMobileSidebarOpen(false);
                }}
                onNew={() => {
                  setConversationId(null);
                  setMobileSidebarOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1">
        <ChatAssistant
          jobId={jobIdNum}
          conversationId={conversationId}
          onConversationChange={setConversationId}
          onOpenHistory={() => setMobileSidebarOpen(true)}
        />
      </div>
    </div>
  );
}
