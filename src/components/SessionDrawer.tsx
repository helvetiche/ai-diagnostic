import {
  CaretLeftIcon,
  CaretRightIcon,
  ChatCircleTextIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  SquaresFourIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { AiConversation } from "@/types/aiMemory";

const PAGE_SIZE = 8;
const CLOSE_ANIMATION_MS = 500;

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function SessionDrawer({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  conversations: AiConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const closeDrawer = useCallback(() => {
    dialogRef.current?.close();
    setSearch("");
    setPage(1);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
      return;
    }

    if (!dialog.open) {
      return;
    }

    // Fallback for reduced-motion environments where animationend never fires.
    const timer = window.setTimeout(closeDrawer, CLOSE_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [open, closeDrawer]);

  const normalized = search.trim().toLowerCase();
  const filtered = normalized
    ? conversations.filter((conversation) => conversation.title.toLowerCase().includes(normalized))
    : conversations;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <dialog
      ref={dialogRef}
      aria-label="All sessions"
      onCancel={(event) => {
        // Keep the native dialog open so the closing animation can play.
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 z-30 m-0 h-full w-full max-w-none overflow-hidden border-0 bg-transparent p-0"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-background/45 backdrop-blur-[2px] ease-soft duration-[500ms]",
          open ? "animate-in fade-in" : "animate-out fade-out fill-mode-forwards",
        )}
      />

      <div
        onAnimationEnd={() => {
          if (!open) {
            closeDrawer();
          }
        }}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-[380px] flex-col border-l border-border bg-surface shadow-card ease-soft",
          open
            ? "animate-in fade-in slide-in-from-right-full duration-[500ms]"
            : "animate-out fade-out slide-out-to-right-full fill-mode-forwards duration-[400ms]",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <h2 className="flex items-center gap-2 font-mono text-[12px] font-medium text-foreground">
            <SquaresFourIcon size={13} className="shrink-0 text-primary" aria-hidden="true" />
            Sessions <span className="text-muted-foreground">· {conversations.length}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sessions"
            className="text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground"
          >
            <XIcon size={14} weight="fill" aria-hidden="true" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 border border-border bg-surface/50 px-2.5 py-1.5">
            <MagnifyingGlassIcon
              size={12}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search sessions"
              aria-label="Search sessions"
              className="min-w-0 flex-1 bg-transparent font-mono text-[10px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {visible.length === 0 ? (
            <p className="py-6 text-center font-mono text-[10px] text-muted-foreground">
              No sessions found
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {visible.map((conversation) => {
                const isActive = conversation.id === activeId;
                return (
                  <div
                    key={conversation.id}
                    className={cn(
                      "flex items-stretch gap-1 border transition-colors duration-[120ms] ease-soft",
                      isActive
                        ? "border-primary/40 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:bg-surface-muted hover:text-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(conversation.id);
                        onClose();
                      }}
                      className="flex min-w-0 flex-1 flex-col gap-1 px-2.5 py-2 text-left"
                    >
                      <span className="flex items-center gap-1.5 truncate font-mono text-[11px]">
                        <ChatCircleTextIcon size={11} className="shrink-0" aria-hidden="true" />
                        <span className="truncate">{conversation.title}</span>
                      </span>
                      <span className="flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
                        <ClockIcon size={10} className="shrink-0" aria-hidden="true" />
                        {formatDate(conversation.updatedAt)}
                      </span>
                    </button>
                    {onDelete ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(conversation.id);
                        }}
                        aria-label={`Remove ${conversation.title}`}
                        title="Remove session memory"
                        className="flex shrink-0 items-center px-2 text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-critical"
                      >
                        <TrashIcon size={12} aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={currentPage === 1}
            aria-label="Previous page"
            className="border border-border p-1 text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <CaretLeftIcon size={12} aria-hidden="true" />
          </button>
          <span className="font-mono text-[10px] text-muted-foreground">
            {currentPage} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            disabled={currentPage === pageCount}
            aria-label="Next page"
            className="border border-border p-1 text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <CaretRightIcon size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
    </dialog>
  );
}
