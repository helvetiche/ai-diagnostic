import {
  ArrowRightIcon,
  CaretDownIcon,
  ChatCircleDotsIcon,
  ChatCircleTextIcon,
  CheckIcon,
  DownloadSimpleIcon,
  GearIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  SquaresFourIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";

import { TypewriterText } from "@/components/TypewriterText";
import { SessionDrawer } from "@/components/SessionDrawer";
import { Button } from "@/components/primitives/Button";
import { requestChatReply, type ChatTurn } from "@/lib/aiChat";
import { saveConversationMarkdown } from "@/lib/aiMarkdown";
import { useOpenRouterConfig, type OpenRouterConfig } from "@/lib/openRouterConfig";
import { cn } from "@/lib/utils";
import type { AiConversation, AiMessage } from "@/types/aiChat";

const SUGGESTIONS = [
  "What is my PC Specifications",
  "Is my battery healthy?",
  "Why did my PC crash?",
  "Show recent reliability events",
] as const;

const MAX_VISIBLE_TABS = 3;
const AI_REQUEST_TIMEOUT_MS = 130_000;

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} timed out. Restart the app and try again.`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type MessageSetter = Dispatch<SetStateAction<AiMessage[]>>;
type ConversationSetter = Dispatch<SetStateAction<AiConversation[]>>;
type NullableStringSetter = Dispatch<SetStateAction<string | null>>;
type BooleanSetter = Dispatch<SetStateAction<boolean>>;

function formatMessageTime(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function toTopicTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const short = clean.slice(0, 36);
  return short.length < clean.length ? `${short}…` : short;
}

const ChatMessageRow = memo(function ChatMessageRow({ message }: { message: AiMessage }) {
  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1",
        message.role === "user" ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "max-w-[85%] px-3 py-2 text-[12px] leading-5",
          message.role === "user"
            ? "bg-primary text-primary-foreground"
            : "font-sans text-foreground",
        )}
      >
        {message.role === "assistant" ? (
          <TypewriterText text={message.content} stagger={8} className="font-mono" />
        ) : (
          <span className="font-sans whitespace-pre-wrap">{message.content}</span>
        )}
      </div>
      <span className="font-mono text-[9px] text-muted-foreground">
        {formatMessageTime(message.createdAt)}
        {message.role === "assistant" && typeof message.tokens === "number"
          ? ` · ${message.tokens.toLocaleString()} tokens`
          : ""}
      </span>
    </div>
  );
});

async function saveConversationMessages(
  messages: AiMessage[],
  setSaveStatus: NullableStringSetter,
) {
  if (messages.length === 0) {
    return;
  }
  try {
    const path = await saveConversationMarkdown(messages);
    setSaveStatus(`Saved to ${path}`);
  } catch (cause) {
    setSaveStatus(cause instanceof Error ? cause.message : String(cause));
  }
}

const LOCAL_CONTEXT_KEY = "machine";

function makeLocalConversation(): AiConversation {
  const now = Date.now();
  return {
    id: `local-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: "Current chat",
    contextKey: LOCAL_CONTEXT_KEY,
    createdAt: now,
    updatedAt: now,
    archived: false,
  };
}

/**
 * Conversation state lives only in React. There is no memory system, so
 * opening Ask AI and sending a message never touch SQLite or Tauri.
 */
function useConversationState() {
  const [conversations, setConversations] = useState<AiConversation[]>(() => [
    makeLocalConversation(),
  ]);
  const [conversationId, setConversationId] = useState<string | null>(
    () => conversations[0]?.id ?? null,
  );
  const conversationIdRef = useRef<string | null>(conversationId);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  function setActiveConversationId(id: string | null) {
    conversationIdRef.current = id;
    setConversationId(id);
  }

  function getActiveConversationId() {
    return conversationIdRef.current;
  }

  function activateConversation(id: string) {
    setActiveConversationId(id);
    setMessages([]);
    setError(null);
    setSaveStatus(null);
  }

  function newConversation() {
    const conv = makeLocalConversation();
    setConversations([conv]);
    setActiveConversationId(conv.id);
    setMessages([]);
    setError(null);
    setSaveStatus(null);
  }

  function deleteConversation(id: string) {
    const remaining = conversations.filter((conversation) => conversation.id !== id);
    setConversations(remaining);
    if (id === conversationId) {
      if (remaining.length > 0) {
        activateConversation(remaining[0].id);
      } else {
        newConversation();
      }
    }
  }

  async function saveMarkdown() {
    await saveConversationMessages(messages, setSaveStatus);
  }

  return {
    conversations,
    conversationId,
    messages,
    sending,
    error,
    saveStatus,
    sessionsOpen,
    setConversations,
    setMessages,
    setError,
    setSending,
    setSessionsOpen,
    activateConversation,
    newConversation,
    deleteConversation,
    saveMarkdown,
    getActiveConversationId,
  };
}

function useChatSubmit({
  config,
  messages,
  sending,
  getActiveConversationId,
  setConversations,
  setMessages,
  setError,
  setSending,
}: {
  config: OpenRouterConfig;
  messages: AiMessage[];
  sending: boolean;
  getActiveConversationId: () => string | null;
  setConversations: ConversationSetter;
  setMessages: MessageSetter;
  setError: NullableStringSetter;
  setSending: BooleanSetter;
}) {
  const [query, setQuery] = useState("");

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const text = query.trim();
    if (!text || sending) {
      return;
    }

    setQuery("");
    setError(null);
    setSending(true);

    const userMessage: AiMessage = {
      id: `local-${Date.now()}-u`,
      conversationId: getActiveConversationId() ?? "local",
      role: "user",
      content: text,
      model: null,
      tokens: null,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    const history: ChatTurn[] = messages
      .slice(-20)
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({
        role: message.role as ChatTurn["role"],
        content: message.content,
      }));

    const title = messages.length === 0 ? toTopicTitle(text) : null;
    const targetConversationId = getActiveConversationId();

    if (title && targetConversationId) {
      setConversations((prev) =>
        prev.map((conversation) =>
          conversation.id === targetConversationId ? { ...conversation, title } : conversation,
        ),
      );
    }

    try {
      const reply = await withTimeout(
        requestChatReply(config, [...history, { role: "user", content: text }]),
        "AI request",
        AI_REQUEST_TIMEOUT_MS,
      );

      if (getActiveConversationId() !== targetConversationId) {
        return;
      }

      const content = reply || "(no response)";
      const assistantMessage: AiMessage = {
        id: `local-${Date.now()}-a`,
        conversationId: targetConversationId ?? "local",
        role: "assistant",
        content,
        model: config.model,
        tokens: null,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      if (getActiveConversationId() === targetConversationId) {
        setError(err instanceof Error ? err.message : String(err));
        setQuery(text);
        setMessages((prev) => prev.filter((message) => message.id !== userMessage.id));
      }
    } finally {
      setSending(false);
    }
  }

  return { query, setQuery, handleSubmit };
}

function useEscapeDismiss({
  active,
  modelOpen,
  sessionsOpen,
  onClose,
  onCloseModels,
  onCloseSessions,
}: {
  active: boolean;
  modelOpen: boolean;
  sessionsOpen: boolean;
  onClose: () => void;
  onCloseModels: () => void;
  onCloseSessions: () => void;
}) {
  useEffect(() => {
    if (!active) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (modelOpen) {
        onCloseModels();
        return;
      }
      if (sessionsOpen) {
        onCloseSessions();
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, modelOpen, sessionsOpen, onClose, onCloseModels, onCloseSessions]);
}

function useAutoScroll(
  listRef: RefObject<HTMLDivElement | null>,
  messages: AiMessage[],
  sending: boolean,
) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) {
        return;
      }
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      if (nearBottom) {
        list.scrollTop = list.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [listRef, messages, sending]);
}

function SessionTabs({
  conversations,
  activeId,
  hiddenCount,
  onSelect,
  onShowAll,
}: {
  conversations: AiConversation[];
  activeId: string | null;
  hiddenCount: number;
  onSelect: (id: string) => void;
  onShowAll: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
      {conversations.map((conversation) => {
        const isActive = conversation.id === activeId;
        return (
          <button
            key={conversation.id}
            type="button"
            onClick={() => onSelect(conversation.id)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border px-2.5 py-1 font-mono text-[10px] transition-colors duration-[120ms] ease-soft",
              isActive
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-transparent text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <ChatCircleTextIcon size={11} className="shrink-0" aria-hidden="true" />
            <span className="truncate">{conversation.title}</span>
          </button>
        );
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={onShowAll}
          aria-label={`Show ${hiddenCount} more sessions`}
          className="flex shrink-0 items-center gap-1.5 border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface-muted hover:text-foreground"
        >
          <SquaresFourIcon size={11} aria-hidden="true" />+{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

function PanelActions({
  canSave,
  onSave,
  onNew,
  onClose,
}: {
  canSave: boolean;
  onSave: () => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onSave}
        aria-label="Save conversation as Markdown"
        title="Save as Markdown"
        disabled={!canSave}
        className="text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground disabled:pointer-events-none disabled:opacity-45"
      >
        <DownloadSimpleIcon size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onNew}
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
  );
}

function AskAiHeader({
  conversations,
  activeId,
  hiddenCount,
  canSave,
  onSelect,
  onShowAll,
  onSave,
  onNew,
  onClose,
}: {
  conversations: AiConversation[];
  activeId: string | null;
  hiddenCount: number;
  canSave: boolean;
  onSelect: (id: string) => void;
  onShowAll: () => void;
  onSave: () => void;
  onNew: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
      <SessionTabs
        conversations={conversations}
        activeId={activeId}
        hiddenCount={hiddenCount}
        onSelect={onSelect}
        onShowAll={onShowAll}
      />
      <PanelActions canSave={canSave} onSave={onSave} onNew={onNew} onClose={onClose} />
    </div>
  );
}

function SuggestionGrid({ onPick }: { onPick: (suggestion: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
      <ChatCircleDotsIcon size={24} className="text-muted-foreground" aria-hidden="true" />
      <p className="text-[13px] font-medium text-foreground">New chat</p>
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion, index) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
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
  );
}

function MessageList({
  listRef,
  messages,
  sending,
  error,
  saveStatus,
  onPickSuggestion,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  messages: AiMessage[];
  sending: boolean;
  error: string | null;
  saveStatus: string | null;
  onPickSuggestion: (suggestion: string) => void;
}) {
  return (
    <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
      {messages.length === 0 && !sending ? (
        <SuggestionGrid onPick={onPickSuggestion} />
      ) : (
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
          {messages.map((m) => (
            <ChatMessageRow key={m.id} message={m} />
          ))}
          {sending ? (
            <p
              className="self-start font-mono text-[10px] text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <TypewriterText text="Waiting for response…" stagger={40} className="font-mono" />
            </p>
          ) : null}
        </div>
      )}
      {error || saveStatus ? (
        <div className="mx-auto mt-3 flex w-full max-w-[760px] flex-col gap-1">
          {error ? <p className="self-start font-mono text-[10px] text-critical">{error}</p> : null}
          {saveStatus ? (
            <p className="self-start break-all font-mono text-[10px] text-success">{saveStatus}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ModelListbox({
  config,
  setConfig,
  modelFilter,
  setModelFilter,
  filteredModels,
  inputRef,
  onClose,
  onOpenSettings,
}: {
  config: OpenRouterConfig;
  setConfig: (next: OpenRouterConfig) => void;
  modelFilter: string;
  setModelFilter: Dispatch<SetStateAction<string>>;
  filteredModels: OpenRouterConfig["models"];
  inputRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  return (
    <div
      role="listbox"
      aria-label="AI model"
      className="absolute bottom-[calc(100%_+_6px)] left-0 z-10 w-56 bg-surface-raised p-1 shadow-soft"
    >
      <div className="flex items-center gap-1.5 px-1.5 pb-1">
        <MagnifyingGlassIcon
          size={11}
          className="shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={searchRef}
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
                onClose();
                inputRef.current?.focus();
              }}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-[10px] text-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface-muted"
            >
              <span className={cn("min-w-0 flex-1 truncate", model.free && "text-success")}>
                {model.name}
              </span>
              {model.free ? (
                <span className="shrink-0 font-mono text-[8px] text-success">FREE</span>
              ) : null}
              {model.id === config.model ? (
                <CheckIcon size={11} className="shrink-0 text-primary" aria-hidden="true" />
              ) : null}
            </button>
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenSettings();
        }}
        className="mt-1 flex w-full items-center gap-2 px-2 py-1.5 text-left font-mono text-[10px] text-muted-foreground transition-colors duration-[120ms] ease-soft hover:bg-surface-muted hover:text-foreground"
      >
        <GearIcon size={11} className="shrink-0" aria-hidden="true" />
        Configure OpenRouter…
      </button>
    </div>
  );
}

function ModelPicker({
  config,
  setConfig,
  inputRef,
  modelOpen,
  setModelOpen,
  onOpenSettings,
}: {
  config: OpenRouterConfig;
  setConfig: (next: OpenRouterConfig) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  modelOpen: boolean;
  setModelOpen: Dispatch<SetStateAction<boolean>>;
  onOpenSettings: () => void;
}) {
  const modelRef = useRef<HTMLDivElement>(null);
  const [modelFilter, setModelFilter] = useState("");

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
  }, [modelOpen, setModelOpen]);

  return (
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

      {modelOpen ? (
        <ModelListbox
          config={config}
          setConfig={setConfig}
          modelFilter={modelFilter}
          setModelFilter={setModelFilter}
          filteredModels={filteredModels}
          inputRef={inputRef}
          onClose={() => setModelOpen(false)}
          onOpenSettings={onOpenSettings}
        />
      ) : null}
    </div>
  );
}

function ComposerForm({
  query,
  setQuery,
  sending,
  inputRef,
  modelPicker,
  onSubmit,
}: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  sending: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  modelPicker: ReactNode;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-[760px] items-center gap-2">
        {modelPicker}

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
                onSubmit();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="primary"
          className="h-9 gap-2 px-3 font-mono text-[10px] font-semibold tracking-wide uppercase"
          disabled={sending || query.trim().length === 0}
          onClick={() => onSubmit()}
        >
          <PaperPlaneTiltIcon size={12} weight="fill" aria-hidden="true" />
          Send
        </Button>
      </div>
    </form>
  );
}

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
  const listRef = useRef<HTMLDivElement>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const conversation = useConversationState();
  const chat = useChatSubmit({
    config,
    messages: conversation.messages,
    sending: conversation.sending,
    getActiveConversationId: conversation.getActiveConversationId,
    setConversations: conversation.setConversations,
    setMessages: conversation.setMessages,
    setError: conversation.setError,
    setSending: conversation.setSending,
  });

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEscapeDismiss({
    active: open && keyboardActive,
    modelOpen,
    sessionsOpen: conversation.sessionsOpen,
    onClose,
    onCloseModels: () => setModelOpen(false),
    onCloseSessions: () => conversation.setSessionsOpen(false),
  });
  useAutoScroll(listRef, conversation.messages, conversation.sending);

  function pickSuggestion(suggestion: string) {
    chat.setQuery(suggestion);
    inputRef.current?.focus();
  }

  if (!open) {
    return null;
  }

  const activeIndex = conversation.conversations.findIndex(
    (c) => c.id === conversation.conversationId,
  );
  let visibleConversations = conversation.conversations.slice(0, MAX_VISIBLE_TABS);
  if (activeIndex >= MAX_VISIBLE_TABS) {
    visibleConversations = [
      ...conversation.conversations.slice(0, MAX_VISIBLE_TABS - 1),
      conversation.conversations[activeIndex],
    ];
  }
  const hiddenCount = conversation.conversations.length - visibleConversations.length;

  return (
    <>
      <dialog
        id="ask-ai-panel"
        aria-label="Ask AI"
        open
        className="ask-ai-panel fixed inset-x-0 top-[40px] bottom-0 z-20 m-0 flex h-auto max-h-none w-auto max-w-none flex-col border-t border-border bg-surface p-0 text-foreground shadow-card"
      >
        <AskAiHeader
          conversations={visibleConversations}
          activeId={conversation.conversationId}
          hiddenCount={hiddenCount}
          canSave={conversation.messages.length > 0}
          onSelect={(id) => void conversation.activateConversation(id)}
          onShowAll={() => conversation.setSessionsOpen(true)}
          onSave={() => void conversation.saveMarkdown()}
          onNew={() => void conversation.newConversation()}
          onClose={onClose}
        />

        <MessageList
          listRef={listRef}
          messages={conversation.messages}
          sending={conversation.sending}
          error={conversation.error}
          saveStatus={conversation.saveStatus}
          onPickSuggestion={pickSuggestion}
        />

        <ComposerForm
          query={chat.query}
          setQuery={chat.setQuery}
          sending={conversation.sending}
          inputRef={inputRef}
          modelPicker={
            <ModelPicker
              config={config}
              setConfig={setConfig}
              inputRef={inputRef}
              modelOpen={modelOpen}
              setModelOpen={setModelOpen}
              onOpenSettings={onOpenSettings}
            />
          }
          onSubmit={chat.handleSubmit}
        />
      </dialog>

      <SessionDrawer
        open={conversation.sessionsOpen}
        onClose={() => conversation.setSessionsOpen(false)}
        conversations={conversation.conversations}
        activeId={conversation.conversationId}
        onSelect={(id) => void conversation.activateConversation(id)}
        onDelete={(id) => void conversation.deleteConversation(id)}
      />
    </>
  );
}
