import {
  ArrowRightIcon,
  CaretDownIcon,
  CheckIcon,
  GearIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/primitives/Button";
import { TypewriterText } from "@/components/TypewriterText";
import { useOpenRouterConfig } from "@/lib/openRouterConfig";
import { aiMemory } from "@/lib/aiMemory";
import { cn } from "@/lib/utils";
import type { AiConversation, AiMessage } from "@/types/aiMemory";

const SUGGESTIONS = [
  "What is my PC Specifications",
  "Is my battery healthy?",
  "Why did my PC crash?",
  "Show recent reliability events",
] as const;

export function AskAiDrawer({
  open,
  onClose,
  onOpenSettings,
  keyboardActive = true,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  keyboardActive?: boolean;
}) {
  const { config, setConfig } = useOpenRouterConfig();
  const inputRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const modelOpenRef = useRef(false);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(open);
  const [query, setQuery] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  modelOpenRef.current = modelOpen;
  const closing = mounted && !open;
  const activeModel = config.models.find((model) => model.id === config.model) ?? {
    id: config.model,
    name: config.model,
    free: config.model.toLowerCase().includes(":free"),
  };
  const modelOptions = config.models.some((model) => model.id === config.model)
    ? config.models
    : [...config.models, activeModel];
  const filteredModels = modelOptions.filter((model) =>
    `${model.name} ${model.id}`.toLowerCase().includes(modelFilter.trim().toLowerCase()),
  );

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [convLoading, setConvLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setQuery("");
      setModelOpen(false);
      setError(null);
    }
  }, [open]);

  // Load or create a conversation when the drawer opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function ensure() {
      setConvLoading(true);
      try {
        const list = await aiMemory.conversationList(50, 0, false);
        const existing = list.find((c) => c.contextKey === "machine" && c.title === "Ask AI");
        let conv: AiConversation;
        if (existing) {
          conv = existing;
        } else {
          conv = await aiMemory.conversationCreate("Ask AI", "machine");
        }
        if (cancelled) return;
        setConversationId(conv.id);
        const msgs = await aiMemory.messageList(conv.id, 200);
        if (cancelled) return;
        setMessages(msgs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setConvLoading(false);
      }
    }
    void ensure();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!modelOpen) {
      return;
    }
    function handlePointerDown(event: PointerEvent) {
      if (!modelRef.current?.contains(event.target as Node)) {
        setModelOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [modelOpen]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !keyboardActive) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (modelOpenRef.current) {
        setModelOpen(false);
        return;
      }
      onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, keyboardActive]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, sending]);

  if (!mounted) {
    return null;
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = query.trim();
    if (!text || sending) return;
    setQuery("");
    setError(null);
    setSending(true);

    // Show the user message immediately, independent of storage.
    const localUserId = `local-${Date.now()}-u`;
    setMessages((prev) => [
      ...prev,
      {
        id: localUserId,
        conversationId: conversationId ?? "local",
        role: "user",
        content: text,
        model: null,
        tokens: null,
        createdAt: Date.now(),
      },
    ]);

    let convId = conversationId;
    try {
      // Best-effort persistence; never block the chat on storage.
      if (!convId) {
        const conv = await aiMemory.conversationCreate("Ask AI", "machine").catch(() => null);
        if (conv) {
          convId = conv.id;
          setConversationId(conv.id);
        }
      }
      if (convId) {
        void aiMemory.messageAppend(convId, "user", text).catch(() => {});
      }

      // Simple generative chat: no system instructions, just the conversation.
      const history = messages
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const apiMessages = [...history, { role: "user", content: text }];

      const reply = await invoke<string>("openrouter_chat", {
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: apiMessages,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      const content = (reply || "").trim() || "(no response)";
      const localAssistantId = `local-${Date.now()}-a`;
      setMessages((prev) => [
        ...prev,
        {
          id: localAssistantId,
          conversationId: convId ?? "local",
          role: "assistant",
          content,
          model: config.model,
          tokens: null,
          createdAt: Date.now(),
        },
      ]);

      if (convId) {
        void aiMemory.messageAppend(convId, "assistant", content, config.model).catch(() => {});
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Ask AI failed:", err);
      setError(msg);
      setQuery(text);
      if (convId) {
        try {
          const errMsg = await aiMemory.messageAppend(convId, "assistant", `Error: ${msg}`, config.model);
          setMessages((prev) => [...prev, errMsg]);
        } catch {
          // ignore persistence failure
        }
      }
    } finally {
      setSending(false);
    }
  }

  async function newConversation() {
    const conv = await aiMemory.conversationCreate("Ask AI", "machine");
    setConversationId(conv.id);
    setMessages([]);
    setError(null);
  }

  const closingState = closing;

  return (
    <section
      id="ask-ai-panel"
      role="dialog"
      aria-label="Ask AI"
      onAnimationEnd={() => {
        if (closingState) {
          setMounted(false);
        }
      }}
      className={cn(
        "ask-ai-panel fixed inset-x-0 top-[40px] bottom-0 z-20 flex flex-col border-t border-border bg-surface/60 shadow-card backdrop-blur-xs ease-soft",
        closingState
          ? "animate-out fade-out slide-out-to-bottom-full fill-mode-forwards duration-[450ms]"
          : "animate-in fade-in slide-in-from-bottom-full duration-[700ms]",
      )}
    >
      <div className="ask-ai-spotlights" aria-hidden="true" />
      <div className="ask-ai-vignette" aria-hidden="true" />

      <div className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="ai-sparkle [--ai-sparkle-size:18px]" aria-hidden="true" />
          <p className="text-[13px] font-medium text-foreground">Ask about this machine</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void newConversation()}
            aria-label="New conversation"
            className="text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground"
          >
            <PlusIcon size={14} weight="bold" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Ask AI"
            className="text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground"
          >
            <XIcon size={14} weight="fill" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        {convLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-[10px] text-muted-foreground">Loading memory…</p>
        </div>
      ) : messages.length === 0 && !sending ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <p className="text-[13px] font-medium text-foreground">Ask about this machine</p>
            <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((suggestion, index) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setQuery(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="group flex items-center gap-2 border border-border bg-surface/50 px-2.5 py-2 font-mono text-[10px] leading-4 text-muted-foreground transition-colors duration-[120ms] ease-soft hover:border-primary/40 hover:bg-primary/10 hover:text-foreground"
                >
                  <span className="text-[9px] text-primary/80">{String(index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1 text-left">{suggestion}</span>
                  <ArrowRightIcon
                    size={11}
                    className="shrink-0 opacity-0 transition-opacity duration-[120ms] ease-soft group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "max-w-[85%] px-3 py-2 text-[12px] leading-5",
                  m.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start border border-border-subtle bg-surface text-foreground",
                )}
              >
                {m.role === "assistant" ? (
                  <TypewriterText text={m.content} stagger={8} className="font-mono" />
                ) : (
                  <span className="font-mono whitespace-pre-wrap">{m.content}</span>
                )}
              </div>
            ))}
            {sending && (
              <div className="self-start border border-border-subtle bg-surface px-3 py-2 text-[12px] text-muted-foreground">
                <TypewriterText text="Thinking…" stagger={40} className="font-mono" />
              </div>
            )}
            {error && (
              <p className="self-start font-mono text-[10px] text-critical">{error}</p>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[760px] items-center gap-2">
          <div ref={modelRef} className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={modelOpen}
              onClick={() => {
                setModelFilter("");
                setModelOpen((value) => !value);
              }}
              className="flex items-center gap-2 bg-surface/50 px-2.5 py-1.5 font-mono text-[10px] text-foreground transition-colors duration-[120ms] ease-soft hover:bg-primary/10"
            >
              <span className={activeModel.free ? "text-success" : undefined}>{activeModel.name}</span>
              <CaretDownIcon
                size={10}
                weight="bold"
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-muted-foreground transition-transform duration-[120ms] ease-soft",
                  modelOpen && "rotate-180",
                )}
              />
            </button>

            {modelOpen && (
              <div
                role="listbox"
                aria-label="AI model"
                className="absolute bottom-[calc(100%_+_6px)] left-0 z-10 w-56 bg-surface-raised p-1 shadow-soft"
              >
                <div className="flex items-center gap-1.5 px-1.5 pb-1">
                  <MagnifyingGlassIcon size={11} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  <input
                    autoFocus
                    type="text"
                    value={modelFilter}
                    onChange={(event) => setModelFilter(event.target.value)}
                    placeholder="Search models…"
                    aria-label="Search models"
                    className="min-w-0 flex-1 bg-transparent py-1 font-mono text-[10px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto overscroll-contain">
                  {filteredModels.length === 0 ? (
                    <p className="px-2 py-2 font-mono text-[10px] text-muted-foreground">No models found.</p>
                  ) : (
                    filteredModels.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        role="option"
                        aria-selected={model.id === config.model}
                        onClick={() => {
                          setConfig({ ...config, model: model.id });
                          setModelOpen(false);
                          inputRef.current?.focus();
                        }}
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-[10px] text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface-muted"
                      >
                        <span className={cn("min-w-0 flex-1 truncate", model.free && "text-success")}>
                          {model.name}
                        </span>
                        {model.free && (
                          <span className="shrink-0 font-mono text-[8px] text-success">FREE</span>
                        )}
                        {model.id === config.model && (
                          <CheckIcon size={11} className="shrink-0 text-primary" aria-hidden="true" />
                        )}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModelOpen(false);
                    onOpenSettings();
                  }}
                  className="mt-1 flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface-muted hover:text-foreground"
                >
                  <GearIcon size={11} className="shrink-0" aria-hidden="true" />
                  Configure OpenRouter…
                </button>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-none border border-border bg-[#120F17] px-3">
            <MagnifyingGlassIcon
              size={13}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              aria-label="Ask AI"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask about power, reliability, or logs…"
              className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[12px] text-white/90 placeholder:text-white/50 focus:outline-none"
              disabled={sending}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="primary"
            className="h-9 gap-2 px-3 font-mono text-[10px] font-semibold tracking-wide uppercase"
            disabled={sending || query.trim().length === 0}
            onClick={() => void handleSubmit()}
          >
            <PaperPlaneTiltIcon size={12} weight="fill" aria-hidden="true" />
            Send
          </Button>
        </div>
      </form>
    </section>
  );
}