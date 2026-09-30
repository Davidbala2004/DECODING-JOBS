"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIdentityStore } from "@/lib/identityStore";
import { listChatConversations, deleteChatConversation } from "@/lib/api";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * The conversation-history sidebar every chat product in this category
 * (ChatGPT, Claude) has — lists past AI Assistant conversations, lets you
 * jump back into one or start fresh.
 */
export function ChatHistorySidebar({
  selectedId,
  onSelect,
  onNew,
}: {
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  const email = useIdentityStore((s) => s.email);
  const queryClient = useQueryClient();

  const { data: conversations } = useQuery({
    queryKey: ["chatConversations", email],
    queryFn: () => listChatConversations(),
    enabled: !!email,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteChatConversation(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["chatConversations", email] });
      if (id === selectedId) onNew();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="scroll-thin flex h-full w-full flex-col overflow-y-auto bg-gray-50/60 p-2">
      <button
        type="button"
        onClick={onNew}
        className="mb-2 flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-green-200 hover:bg-green-50 hover:text-green-700 active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" />
        New chat
      </button>

      <div className="flex flex-col gap-0.5">
        {conversations?.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
              c.id === selectedId ? "bg-green-100/70" : "hover:bg-gray-100"
            )}
          >
            <button type="button" onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", c.id === selectedId ? "text-green-600" : "text-gray-400")} />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[12.5px]", c.id === selectedId ? "font-semibold text-green-800" : "text-gray-700")}>
                  {c.title}
                </p>
                <p className="text-[11.5px] text-gray-400">{relativeTime(c.updated_at)}</p>
              </div>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                deleteMutation.mutate(c.id);
              }}
              className="shrink-0 rounded-md p-1 text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
              title="Delete conversation"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {conversations?.length === 0 && (
          <p className="mt-4 px-2 text-center text-[12.5px] text-gray-300">No conversations yet</p>
        )}
      </div>
    </div>
  );
}
