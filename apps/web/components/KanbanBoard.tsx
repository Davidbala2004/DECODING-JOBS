"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Send, MessagesSquare, Trophy, Mail, AlertTriangle, MapPin, Plus, Sparkles, Copy, Check, X, FileText } from "lucide-react";

import { cn } from "@/lib/utils";
import { useIdentityStore } from "@/lib/identityStore";
import { useLiveUpdatesStore } from "@/lib/liveUpdatesStore";
import { EmailGate } from "@/components/EmailGate";
import {
  getApplicationBoard,
  updateApplicationStatus,
  updateInterviewRound,
  type ApplicationBoardCard,
  type ApplicationStatus,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Columns — one green-family theme throughout (lighter → deeper as a card
// progresses), no unrelated hues.
// ---------------------------------------------------------------------------

const COLUMNS: { status: ApplicationStatus; label: string; icon: React.ElementType; accent: string }[] = [
  { status: "saved", label: "Saved", icon: Bookmark, accent: "#94a3b8" },
  { status: "applied", label: "Applied", icon: Send, accent: "#22c55e" },
  { status: "interview", label: "Interviewing", icon: MessagesSquare, accent: "#16a34a" },
  { status: "offer", label: "Offered", icon: Trophy, accent: "#059669" },
];

function getInitials(name: string): string {
  return name
    .split(/[\s&]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function logoUrlFor(websiteUrl: string | null): string | null {
  if (!websiteUrl) return null;
  try {
    const domain = new URL(websiteUrl).hostname;
    return `/api/logo?domain=${domain}`;
  } catch {
    return null;
  }
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

// ---------------------------------------------------------------------------
// Interview round stepper — pips fill in as rounds are cleared, with a
// button to advance to the next one.
// ---------------------------------------------------------------------------

function RoundStepper({ applicationId, round }: { applicationId: number; round: number }) {
  const queryClient = useQueryClient();
  const email = useIdentityStore((s) => s.email);

  const mutation = useMutation({
    mutationFn: updateInterviewRound,
    onMutate: async ({ interviewRound }) => {
      const key = ["applicationBoard", email];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ApplicationBoardCard[]>(key);
      queryClient.setQueryData<ApplicationBoardCard[]>(key, (old) =>
        old?.map((c) => (c.id === applicationId ? { ...c, interview_round: interviewRound } : c))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["applicationBoard", email], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["applicationBoard", email] }),
  });

  return (
    <div
      className="mt-2.5 flex items-center gap-1.5 border-t border-green-50 pt-2.5"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        {Array.from({ length: Math.max(round, 1) }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-3.5 rounded-full bg-gradient-to-r from-green-400 to-emerald-600"
            style={{ animation: `roundFillIn 0.35s ease-out ${i * 0.05}s both` }}
          />
        ))}
      </div>
      <span className="text-[11.5px] font-bold text-green-700">Round {round}</span>
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ applicationId, interviewRound: round + 1 })}
        className="ml-auto flex items-center gap-0.5 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-700 transition-all hover:bg-green-100 active:scale-95"
      >
        <Plus className="h-2.5 w-2.5" />
        Next round
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function KanbanCard({ card, index }: { card: ApplicationBoardCard; index: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  const company = card.job.company;
  const logo = logoUrlFor(company.website_url);
  const days = daysSince(card.applied_at);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-200 active:cursor-grabbing",
        isDragging ? "opacity-0" : "hover:-translate-y-0.5 hover:border-green-200 hover:shadow-[0_10px_28px_rgba(22,163,74,0.14)]"
      )}
      style={{ animation: `cardFadeIn 0.35s ease-out ${Math.min(index, 8) * 0.04}s both` }}
    >
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 text-[12.5px] font-bold text-green-700">
          {logo ? (
            <img
              src={logo}
              alt={company.name}
              className="h-full w-full object-contain p-1"
              draggable={false}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            getInitials(company.name)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-gray-900">{company.name}</p>
          <p className="truncate text-[12.5px] text-gray-500">{card.job.title}</p>
        </div>
        {card.status === "offer" && <Sparkles className="h-4 w-4 shrink-0 text-emerald-500" />}
      </div>

      {card.auto_tracked && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-bold text-green-600">
          <Mail className="h-2.5 w-2.5" />
          Auto-updated from email
        </span>
      )}

      {card.resume_filename && (
        <span
          className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500"
          title={card.resume_filename}
        >
          <FileText className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{card.resume_filename}</span>
        </span>
      )}

      {card.status === "interview" && (
        <RoundStepper applicationId={card.id} round={card.interview_round ?? 1} />
      )}

      <div className="mt-2.5 flex items-center justify-between">
        {company.area || company.city ? (
          <span className="flex items-center gap-0.5 text-[11.5px] text-gray-400">
            <MapPin className="h-2.5 w-2.5" />
            {company.area || company.city}
          </span>
        ) : (
          <span />
        )}
        <span className="text-[11.5px] font-medium text-gray-300">
          {days === 0 ? "today" : `${days}d ago`}
        </span>
      </div>
    </div>
  );
}

function KanbanCardPreview({ card }: { card: ApplicationBoardCard }) {
  const company = card.job.company;
  const logo = logoUrlFor(company.website_url);
  return (
    <div className="w-[240px] rotate-2 rounded-2xl border border-green-200 bg-white p-3 shadow-[0_16px_40px_rgba(22,163,74,0.25)]">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 text-[12.5px] font-bold text-green-700">
          {logo ? <img src={logo} alt={company.name} className="h-full w-full object-contain p-1" /> : getInitials(company.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-bold text-gray-900">{company.name}</p>
          <p className="truncate text-[12.5px] text-gray-500">{card.job.title}</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

function KanbanColumn({
  status,
  label,
  icon: Icon,
  accent,
  cards,
}: {
  status: ApplicationStatus;
  label: string;
  icon: React.ElementType;
  accent: string;
  cards: ApplicationBoardCard[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full min-w-[260px] flex-1 flex-col rounded-2xl border transition-all duration-200",
        isOver ? "scale-[1.01] border-green-300 bg-green-50/50 shadow-[0_0_0_4px_rgba(34,197,94,0.1)]" : "border-gray-100 bg-gray-50/60"
      )}
    >
      <div className="flex items-center gap-2 px-3.5 py-3">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg transition-transform"
          style={{ background: `${accent}1a`, transform: isOver ? "scale(1.15)" : "scale(1)" }}
        >
          <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
        </span>
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">{label}</h3>
        <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-[11.5px] font-bold text-gray-500 shadow-sm">
          {cards.length}
        </span>
      </div>
      <div className="scroll-thin flex flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-3">
        {cards.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-gray-300">Drop a card here</p>
        ) : (
          cards.map((card, i) => <KanbanCard key={card.id} card={card} index={i} />)
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forwarding banner — where to send interview emails for auto-tracking.
// ---------------------------------------------------------------------------

function ForwardingBanner() {
  const forwardingAddress = useIdentityStore((s) => s.forwardingAddress);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (dismissed) return null;

  if (!forwardingAddress) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3.5 py-2.5 text-[12.5px] text-gray-400">
        <Mail className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1">Email auto-tracking isn&apos;t set up yet — advance rounds with the button on each card for now.</span>
        <button type="button" onClick={() => setDismissed(true)} className="shrink-0 text-gray-300 hover:text-gray-500">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-green-100 bg-gradient-to-r from-green-50 to-emerald-50/50 px-3.5 py-2.5 text-[12.5px] text-green-800">
      <Mail className="h-3.5 w-3.5 shrink-0 text-green-500" />
      <span className="flex-1">
        Forward interview emails to <span className="font-mono font-bold">{forwardingAddress}</span> to auto-update this board
      </span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(forwardingAddress);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11.5px] font-bold text-green-700 shadow-sm transition-all hover:shadow-md active:scale-95"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
      <button type="button" onClick={() => setDismissed(true)} className="shrink-0 text-green-300 hover:text-green-500">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export function KanbanBoard() {
  const email = useIdentityStore((s) => s.email);
  const liveUpdatesEnabled = useLiveUpdatesStore((s) => s.enabled);
  const queryClient = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [activeId, setActiveId] = useState<number | null>(null);

  const { data: cards, isLoading, isError } = useQuery({
    queryKey: ["applicationBoard", email],
    queryFn: () => getApplicationBoard(email as string),
    enabled: !!email,
    refetchInterval: liveUpdatesEnabled ? 15_000 : false,
  });

  const statusMutation = useMutation({
    mutationFn: updateApplicationStatus,
    onMutate: async ({ applicationId, status }) => {
      const key = ["applicationBoard", email];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ApplicationBoardCard[]>(key);
      queryClient.setQueryData<ApplicationBoardCard[]>(key, (old) =>
        old?.map((c) => (c.id === applicationId ? { ...c, status } : c))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["applicationBoard", email], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["applicationBoard", email] }),
  });

  const cardsByStatus = useMemo(() => {
    const map: Record<string, ApplicationBoardCard[]> = {};
    for (const column of COLUMNS) map[column.status] = [];
    for (const card of cards ?? []) {
      map[card.status]?.push(card);
    }
    return map;
  }, [cards]);

  const activeCard = cards?.find((c) => c.id === activeId) ?? null;

  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as number);

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as ApplicationStatus;
    const applicationId = active.id as number;
    const current = cards?.find((c) => c.id === applicationId);
    if (!current || current.status === newStatus) return;
    statusMutation.mutate({ applicationId, status: newStatus });
  };

  if (!email) return <EmailGate title="See your applications" subtitle="Sign in with Google to load your tracker board" />;

  if (isLoading) {
    return (
      <div className="flex h-full w-full flex-col gap-3 p-4">
        <div className="h-6 w-40 animate-pulse rounded-lg bg-gray-100" />
        <div className="flex flex-1 gap-3 overflow-hidden">
          {COLUMNS.map((column) => (
            <div key={column.status} className="flex h-full min-w-[260px] flex-1 flex-col rounded-2xl border border-gray-100 bg-gray-50/60 p-3">
              <div className="mb-3 h-5 w-24 animate-pulse rounded-lg bg-gray-200/70" />
              {[0, 1].map((i) => (
                <div key={i} className="mb-2 h-20 animate-pulse rounded-2xl bg-white" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Couldn&apos;t load your board</p>
          <p className="mt-0.5 text-xs text-gray-400">Check your connection and try again</p>
        </div>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["applicationBoard", email] })}
          className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-all hover:bg-gray-200"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4">
      <style jsx global>{`
        @keyframes cardFadeIn {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes roundFillIn {
          from { opacity: 0; transform: scaleX(0); }
          to { opacity: 1; transform: scaleX(1); }
        }
      `}</style>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-900">Application Tracker</h1>
          <p className="text-xs text-gray-400">Signed in as {email}</p>
        </div>
      </div>
      <ForwardingBanner />
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto">
          {COLUMNS.map((column) => (
            <KanbanColumn key={column.status} {...column} cards={cardsByStatus[column.status] ?? []} />
          ))}
        </div>
        <DragOverlay>{activeCard ? <KanbanCardPreview card={activeCard} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
