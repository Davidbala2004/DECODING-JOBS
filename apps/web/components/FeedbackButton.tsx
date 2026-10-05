"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageSquarePlus, Send, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useIdentityStore } from "@/lib/identityStore";
import { submitFeedback } from "@/lib/api";

/**
 * A small, always-available feedback entry point in the top bar.
 *
 * Before this, feedback lived only on a separate static page reachable by a
 * link testers had to be handed — so a visitor who hit a bug on the map had no
 * way to report it from inside the product. This opens a compact note box that
 * POSTs to the same public `/feedback` endpoint, so the note lands in Postgres
 * and (when the API's email is configured) the owner's inbox.
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const signedInEmail = useIdentityStore((s) => s.email);

  // Prefill the contact address for signed-in users; leave it blank so an
  // anonymous visitor can still submit without handing over contact details.
  useEffect(() => {
    if (open && signedInEmail && !email) setEmail(signedInEmail);
  }, [open, signedInEmail, email]);

  // Close on Escape while the dialog is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const mutation = useMutation({
    mutationFn: () => submitFeedback({ message: message.trim(), email: email.trim() }),
    onSuccess: () => {
      toast.success("Thanks — your feedback is in.");
      setMessage("");
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        title="Send feedback"
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-all hover:bg-green-50 hover:text-green-700 sm:px-3"
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h2 id="feedback-title" className="text-sm font-semibold text-gray-900">
                  Send feedback
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Found a bug or something confusing? Tell us — it goes straight to our inbox.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close feedback dialog"
                className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (message.trim()) mutation.mutate();
              }}
              className="flex flex-col gap-2.5"
            >
              <textarea
                required
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="What happened? What did you expect?"
                className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
              <Input
                type="email"
                placeholder="Email (optional — if you want a reply)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                type="submit"
                disabled={mutation.isPending || !message.trim()}
                className="flex items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-60"
              >
                {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send feedback
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
