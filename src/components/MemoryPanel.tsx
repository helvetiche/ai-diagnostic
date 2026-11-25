import { useEffect, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { useAiConversations } from "@/hooks/useAiConversations";
import { useAiMemoryFacts } from "@/hooks/useAiMemoryFacts";
import { aiMemory } from "@/lib/aiMemory";
import type { MemorySearchHit, MemoryStats } from "@/types/aiMemory";

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function MemoryPanel() {
  const {
    conversations,
    loading: convLoading,
    error: convError,
    remove: removeConv,
    refresh: refreshConv,
  } = useAiConversations();
  const {
    facts,
    loading: factLoading,
    error: factError,
    remove: removeFact,
    clear: clearFacts,
    refresh: refreshFacts,
  } = useAiMemoryFacts();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemorySearchHit[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void aiMemory
      .stats()
      .then(setStats)
      .catch(() => setStats(null));
  }, [conversations.length, facts.length]);

  async function runSearch() {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    setActionError(null);
    try {
      const result = await aiMemory.search(query.trim(), 20);
      setHits(result);
    } catch (cause) {
      setHits([]);
      setActionError(errorText(cause));
    }
  }

  async function deleteConversation(id: string) {
    setActionError(null);
    try {
      await removeConv(id);
    } catch (cause) {
      setActionError(errorText(cause));
    }
  }

  async function deleteFact(id: string) {
    setActionError(null);
    try {
      await removeFact(id);
    } catch (cause) {
      setActionError(errorText(cause));
    }
  }

  async function clearFactList() {
    setActionError(null);
    try {
      await clearFacts();
    } catch (cause) {
      setActionError(errorText(cause));
    }
  }

  async function clearAll() {
    setBusy(true);
    setActionError(null);
    try {
      await aiMemory.clearAll();
      await refreshConv();
      await refreshFacts();
      setHits([]);
      const next = await aiMemory.stats();
      setStats(next);
    } catch (cause) {
      setActionError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Local AI memory
        </p>
        {stats && (
          <p className="font-mono text-[10px] text-muted-foreground">
            {stats.conversations} conv · {stats.messages} msg · {stats.facts} facts
          </p>
        )}
      </div>

      {actionError ? (
        <p className="font-mono text-[10px] text-critical" role="status" aria-live="polite">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-medium text-foreground">Conversations</p>
        {convLoading ? (
          <p className="font-mono text-[10px] text-muted-foreground">Loading…</p>
        ) : convError ? (
          <p className="font-mono text-[10px] text-critical">{convError}</p>
        ) : conversations.length === 0 ? (
          <p className="font-mono text-[10px] text-muted-foreground">No conversations stored.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {conversations.map((conv) => (
              <li
                key={conv.id}
                className="flex items-center justify-between gap-2 border border-border-subtle bg-surface-muted px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-foreground">{conv.title}</p>
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {conv.contextKey} · {new Date(conv.updatedAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="h-6 px-2 font-mono text-[9px]"
                  onClick={() => void deleteConversation(conv.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-foreground">Facts</p>
          {facts.length > 0 && (
            <Button
              variant="ghost"
              className="h-6 px-2 font-mono text-[9px]"
              onClick={() => void clearFactList()}
            >
              Clear facts
            </Button>
          )}
        </div>
        {factLoading ? (
          <p className="font-mono text-[10px] text-muted-foreground">Loading…</p>
        ) : factError ? (
          <p className="font-mono text-[10px] text-critical">{factError}</p>
        ) : facts.length === 0 ? (
          <p className="font-mono text-[10px] text-muted-foreground">No durable facts stored.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {facts.map((fact) => (
              <li
                key={fact.id}
                className="flex items-center justify-between gap-2 border border-border-subtle bg-surface-muted px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-[10px] text-foreground">
                    {fact.key} = {fact.value}
                  </p>
                  <p className="font-mono text-[9px] text-muted-foreground">
                    {fact.scope} · {fact.source}
                    {fact.pinned ? " · pinned" : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="h-6 px-2 font-mono text-[9px]"
                  onClick={() => void deleteFact(fact.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-medium text-foreground">Search memory</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search conversations and facts"
            placeholder="Search conversations and facts…"
            className="min-w-0 flex-1 bg-surface-muted px-2 py-1.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <Button
            variant="quiet"
            className="h-8 px-3 font-mono text-[9px]"
            onClick={() => void runSearch()}
          >
            Search
          </Button>
        </div>
        {hits.length > 0 && (
          <ul className="flex flex-col gap-1">
            {hits.map((hit) => (
              <li
                key={`${hit.entityType}:${hit.entityId}`}
                className="border border-border-subtle bg-surface-muted px-2 py-1.5"
              >
                <p className="font-mono text-[10px] text-foreground">{hit.title}</p>
                <p className="font-mono text-[9px] text-muted-foreground">{hit.snippet}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border-subtle pt-3">
        <Button
          variant="ghost"
          className="h-8 px-3 font-mono text-[9px] text-critical"
          disabled={busy}
          onClick={() => void clearAll()}
        >
          Clear all AI memory
        </Button>
      </div>
    </div>
  );
}
