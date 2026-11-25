import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const INLINE = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function isTableDivider(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function tableAlignment(line: string): string[] {
  return splitTableRow(line).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) {
      return "text-center";
    }
    if (right) {
      return "text-right";
    }
    return "text-left";
  });
}

function isSpecial(line: string): boolean {
  const value = line.trim();
  return (
    value.startsWith("```") ||
    /^#{1,6}\s/.test(value) ||
    /^[-*]\s/.test(value) ||
    /^\d+\.\s/.test(value) ||
    /^>\s?/.test(value) ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(value) ||
    (value.includes("|") && isTableDivider(value))
  );
}

function plain(text: string, key: string): ReactNode {
  return <span key={key}>{text}</span>;
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  INLINE.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(plain(text.slice(last, match.index), `${keyPrefix}-plain-${last}`));
    }

    const token = match[0];
    const key = `${keyPrefix}-token-${match.index}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{plain(token.slice(2, -2), key)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="bg-surface-muted px-1 font-mono text-[11px] text-success">
          {plain(token.slice(1, -1), key)}
        </code>,
      );
    } else {
      nodes.push(<em key={key}>{plain(token.slice(1, -1), key)}</em>);
    }

    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(plain(text.slice(last), `${keyPrefix}-plain-${last}`));
  }

  return nodes;
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="relative my-1">
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? "Copied code" : "Copy code"}
        title={copied ? "Copied" : "Copy code"}
        className="absolute top-1.5 right-1.5 z-10 border border-border-subtle bg-surface p-1 text-muted-foreground transition-colors duration-[120ms] ease-soft hover:text-foreground"
      >
        {copied ? (
          <CheckIcon size={11} className="text-success" aria-hidden="true" />
        ) : (
          <CopyIcon size={11} aria-hidden="true" />
        )}
      </button>
      <pre className="overflow-x-auto border border-border-subtle bg-surface-muted py-2 pr-9 pl-2 font-mono text-[11px] leading-4 text-success">
        <code>{code}</code>
      </pre>
    </div>
  );
}

type BlockContent =
  | { type: "code"; code: string }
  | { type: "table"; headers: string[]; alignments: string[]; rows: string[][] }
  | { type: "rule" }
  | { type: "heading"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "quote"; items: string[] }
  | { type: "paragraph"; lines: string[] };

type MarkdownBlock = BlockContent & { key: string };
type ParsedBlock = { content: BlockContent | null; next: number };

function readCodeBlock(lines: string[], index: number): ParsedBlock {
  const code: string[] = [];
  let cursor = index + 1;
  while (cursor < lines.length && !lines[cursor].trim().startsWith("```")) {
    code.push(lines[cursor]);
    cursor += 1;
  }
  if (cursor < lines.length) {
    cursor += 1;
  }
  return { content: { type: "code", code: code.join("\n") }, next: cursor };
}

function readTable(lines: string[], index: number): ParsedBlock {
  const headers = splitTableRow(lines[index] ?? "");
  const alignments = tableAlignment(lines[index + 1] ?? "");
  const rows: string[][] = [];
  let cursor = index + 2;
  while (cursor < lines.length && (lines[cursor] ?? "").trim().startsWith("|")) {
    rows.push(splitTableRow(lines[cursor] ?? ""));
    cursor += 1;
  }
  return { content: { type: "table", headers, alignments, rows }, next: cursor };
}

function readList(lines: string[], index: number, ordered: boolean): ParsedBlock {
  const pattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
  const items: string[] = [];
  let cursor = index;
  while (cursor < lines.length && pattern.test(lines[cursor] ?? "")) {
    items.push((lines[cursor] ?? "").replace(pattern, ""));
    cursor += 1;
  }
  return { content: { type: "list", ordered, items }, next: cursor };
}

function readQuote(lines: string[], index: number): ParsedBlock {
  const items: string[] = [];
  let cursor = index;
  while (cursor < lines.length && /^>\s?/.test(lines[cursor] ?? "")) {
    items.push((lines[cursor] ?? "").replace(/^>\s?/, ""));
    cursor += 1;
  }
  return { content: { type: "quote", items }, next: cursor };
}

function readParagraph(lines: string[], index: number): ParsedBlock {
  const collected: string[] = [];
  let cursor = index;
  while (
    cursor < lines.length &&
    (lines[cursor] ?? "").trim() !== "" &&
    !isSpecial(lines[cursor] ?? "")
  ) {
    collected.push(lines[cursor] ?? "");
    cursor += 1;
  }
  return { content: { type: "paragraph", lines: collected }, next: cursor };
}

function readBlock(lines: string[], index: number): ParsedBlock {
  const line = lines[index] ?? "";

  if (line.trim().startsWith("```")) {
    return readCodeBlock(lines, index);
  }
  if (line.includes("|") && isTableDivider(lines[index + 1] ?? "")) {
    return readTable(lines, index);
  }
  if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
    return { content: { type: "rule" }, next: index + 1 };
  }
  if (isTableDivider(line)) {
    return { content: null, next: index + 1 };
  }
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) {
    return { content: { type: "heading", text: heading[2] ?? "" }, next: index + 1 };
  }
  if (/^[-*]\s+/.test(line)) {
    return readList(lines, index, false);
  }
  if (/^\d+\.\s+/.test(line)) {
    return readList(lines, index, true);
  }
  if (/^>\s?/.test(line)) {
    return readQuote(lines, index);
  }
  return readParagraph(lines, index);
}

function parseMarkdown(lines: string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    if ((lines[index] ?? "").trim() === "") {
      index += 1;
      continue;
    }
    const parsed = readBlock(lines, index);
    if (parsed.content) {
      blocks.push({ ...parsed.content, key: `md-${blocks.length}` });
    }
    index = parsed.next;
  }
  return blocks;
}

function MarkdownTable({
  headers,
  alignments,
  rows,
}: {
  headers: string[];
  alignments: string[];
  rows: string[][];
}) {
  return (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse font-sans text-[11px]">
        <thead>
          <tr>
            {headers.map((cell, cellIndex) => (
              <th
                key={cellIndex}
                className={cn(
                  "border border-border-subtle bg-surface-muted px-2 py-1 font-semibold text-foreground",
                  alignments[cellIndex] ?? "text-left",
                )}
              >
                {inline(cell, `table-head-${cellIndex}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map((_, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    "border border-border-subtle px-2 py-1 align-top text-foreground",
                    alignments[cellIndex] ?? "text-left",
                  )}
                >
                  {inline(row[cellIndex] ?? "", `table-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownList({ items, ordered }: { items: string[]; ordered: boolean }) {
  const entries = items.map((item, itemIndex) => (
    <li key={itemIndex}>
      {inline(item, `${ordered ? "ordered" : "unordered"}-${itemIndex}`)}
    </li>
  ));
  return ordered ? (
    <ol className="my-1 list-decimal space-y-0.5 pl-4">{entries}</ol>
  ) : (
    <ul className="my-1 list-disc space-y-0.5 pl-4">{entries}</ul>
  );
}

function MarkdownQuote({ items }: { items: string[] }) {
  return (
    <blockquote className="my-1 border-l-2 border-border pl-2 italic text-muted-foreground">
      {items.map((quote, quoteIndex) => (
        <span key={quoteIndex} className="block">
          {inline(quote, `quote-${quoteIndex}`)}
        </span>
      ))}
    </blockquote>
  );
}

function MarkdownParagraph({ lines }: { lines: string[] }) {
  return (
    <p className="my-1 first:mt-0 last:mb-0">
      {lines.map((item, paragraphIndex) => (
        <span key={paragraphIndex} className="block">
          {inline(item, `paragraph-${paragraphIndex}`)}
        </span>
      ))}
    </p>
  );
}

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  switch (block.type) {
    case "code": {
      return <CodeBlock code={block.code} />;
    }
    case "table": {
      return <MarkdownTable {...block} />;
    }
    case "rule": {
      return <hr className="my-3 border-t border-border-subtle" />;
    }
    case "heading": {
      return (
        <p className="mt-1 mb-0.5 font-semibold text-foreground">
          {inline(block.text, "heading")}
        </p>
      );
    }
    case "list": {
      return <MarkdownList items={block.items} ordered={block.ordered} />;
    }
    case "quote": {
      return <MarkdownQuote items={block.items} />;
    }
    case "paragraph": {
      return <MarkdownParagraph lines={block.lines} />;
    }
  }
}

export function MarkdownText({ text }: { text: string }) {
  const blocks = useMemo(() => {
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    return parseMarkdown(lines);
  }, [text]);
  return (
    <div className="block">
      {blocks.map((block) => (
        <MarkdownBlockView key={block.key} block={block} />
      ))}
    </div>
  );
}
