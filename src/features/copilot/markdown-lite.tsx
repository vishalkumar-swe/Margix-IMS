import type { ReactNode } from "react";

/** Renders **bold** and `code` only. Model output never becomes raw HTML. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-slate-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.8em] text-slate-800">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

/** Small, dependency-free markdown for Copilot answers. */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {list.map((item, index) => (
          <li key={index}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      list.push(line.replace(/^\d+\.\s+/, ""));
      continue;
    }
    flushList();
    if (line.startsWith("### ")) {
      blocks.push(
        <p key={index} className="pt-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {line.slice(4)}
        </p>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <p key={index} className="pt-1 text-sm font-semibold text-slate-900">
          {line.slice(3)}
        </p>,
      );
    } else {
      blocks.push(<p key={index}>{inline(line)}</p>);
    }
  }
  flushList();

  return <div className="space-y-2 text-sm leading-relaxed text-slate-700">{blocks}</div>;
}
