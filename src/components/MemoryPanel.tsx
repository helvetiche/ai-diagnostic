import { useEffect, useState } from "react";

import { Button } from "@/components/primitives/Button";
import { aiMemory } from "@/lib/aiMemory";
import { useAiConversations } from "@/hooks/useAiConversations";
import { useAiMemoryFacts } from "@/hooks/useAiMemoryFacts";
import type { MemorySearchHit } from "@/types/aiMemory";

export function MemoryPanel() {
  const { conversations, loading: convLoading, remove: removeConv, refresh: refreshConv } =
    useAiConversations();
  const { facts, loading: factLoading, remove: removeFact, clear: clearFacts, refresh: refreshFacts } =
    useAiMemoryFacts();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemorySearchHit[]>([]);
  const [stats, setStats] = useState<{ conversations: number; messages: number; facts: number; indexEntries: number } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void aiMemory.stats().then(setStats).catch(() => setStats(null));
  }, [conversations.length, facts.length]);

  async function runSearch() {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    try {
      const result = await aiMemory.search(query.trim(), 20);
      setHits(result);
    } catch {
      setHits([]);
    }
  }

  async function clearAll() {
    setBusy(true);
    try {
      await aiMemory.clearAll();
      await refreshConv();
      await refreshFacts();
      setHits([]);
      const s = await aiMemory.stats();
      setStats(s);
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
            {stats.conversations} conv · {stats.messages} msg · {stats.facts} facts · {stats.indexEntries} idx
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-foreground">Conversations</p>
          <Button
            variant="quiet"
            className="h-6 px-2 font-mono text-[9px]"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const conv = await aiMemory.conversationCreate("Test conversation", "machine");
                await aiMemory.messageAppend(conv.id, "user", "Hello memory", undefined, 2);
                await aiMemory.messageAppend(conv.id, "assistant", "Stored locally.", "test-model", 3);
                await refreshConv();
                const s = await aiMemory.stats();
                setStats(s);
              } finally {
                setBusy(false);
              }
            }}
          >
            Add test
          </Button>
        </div>
        {convLoading ? (
          <p className="font-mono text-[10px] text-muted-foreground">Loading…</p>
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
                  onClick={() => void removeConv(conv.id)}
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
          <div className="flex items-center gap-2">
            <Button
              variant="quiet"
              className="h-6 px-2 font-mono text-[9px]"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await aiMemory.factUpsert({
                    scope: "machine",
                    key: "test.fact",
                    value: "hello",
                    source: "user",
                    pinned: true,
                  });
                  await refreshFacts();
                  const s = await aiMemory.stats();
                  setStats(s);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add sample
            </Button>
            {facts.length > 0 && (
            <Button
              variant="ghost"
              className="h-6 px-2 font-mono text-[9px]"
              onClick={() => void clearFacts()}
            >
              Clear facts
            </Button>
          )}
        </div>
        </div>
        {factLoading ? (
          <p className="font-mono text-[10px] text-muted-foreground">Loading…</p>
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
                  onClick={() => void removeFact(fact.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-medium text-foreground">Search index</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search indexed diagnostics…"
            className="min-w-0 flex-1 bg-surface-muted px-2 py-1.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <Button variant="quiet" className="h-8 px-3 font-mono text-[9px]" onClick={() => void runSearch()}>
            Search
          </Button>
        </div>
        {hits.length > 0 && (
          <ul className="flex flex-col gap-1">
            {hits.map((hit) => (
              <li key={`${hit.entityType}:${hit.entityId}`} className="border border-border-subtle bg-surface-muted px-2 py-1.5">
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