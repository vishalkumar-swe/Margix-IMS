import type { ReactNode } from "react";

/** Renders bold, code, italics, and clickable links safely without raw HTML. */
function inline(text: string): ReactNode[] {
  // Matches: **bold**, `code`, [link text](url), *italic*
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|_[^_]+_)/g;
  const parts = text.split(tokenRegex).filter(Boolean);

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
        <code key={index} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.82em] text-slate-800 border border-slate-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
      const closingBracket = part.indexOf("](");
      const label = part.slice(1, closingBracket);
      const url = part.slice(closingBracket + 2, -1);
      return (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-700 underline hover:text-brand-900 transition-colors inline-flex items-center gap-0.5"
        >
          {label}
        </a>
      );
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return (
        <em key={index} className="italic text-slate-600">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutLeading = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutTrailing = withoutLeading.endsWith("|") ? withoutLeading.slice(0, -1) : withoutLeading;
  return withoutTrailing.split("|").map((cell) => cell.trim());
}

function isTableDivider(cells: string[]): boolean {
  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

/** Robust, lightweight markdown renderer for Copilot answers with full table and link support. */
export function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let tableLines: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-1 pl-5 text-xs sm:text-sm">
        {list.map((item, index) => (
          <li key={index} className="leading-relaxed">
            {inline(item)}
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flushTable = () => {
    if (tableLines.length === 0) return;
    const rawRows = tableLines.map(parseTableRow);
    tableLines = [];

    if (rawRows.length === 0) return;

    let headers: string[] = [];
    let rows: string[][] = [];

    if (rawRows.length >= 2 && isTableDivider(rawRows[1])) {
      headers = rawRows[0];
      rows = rawRows.slice(2);
    } else {
      headers = rawRows[0];
      rows = rawRows.slice(1);
    }

    blocks.push(
      <div
        key={`table-${blocks.length}`}
        className="my-3 overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs"
      >
        <table className="w-full min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 font-semibold text-slate-800">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-2 whitespace-nowrap">
                  {inline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 === 1 ? "bg-slate-50/60" : "bg-white"}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-3 py-2 whitespace-nowrap">
                    {inline(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  };

  let codeBlockLines: string[] = [];
  let inCodeBlock = false;

  const flushCodeBlock = () => {
    if (codeBlockLines.length === 0 && !inCodeBlock) return;
    const content = codeBlockLines.join("\n");
    blocks.push(
      <pre
        key={`code-${blocks.length}`}
        className="my-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-100 shadow-sm"
      >
        <code>{content}</code>
      </pre>,
    );
    codeBlockLines = [];
    inCodeBlock = false;
  };

  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        flushTable();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(raw);
      continue;
    }

    if (line.startsWith("|") && line.endsWith("|")) {
      flushList();
      tableLines.push(line);
      continue;
    }
    flushTable();

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

    if (line.startsWith("#### ")) {
      blocks.push(
        <h5 key={index} className="pt-2 text-xs font-semibold text-slate-800">
          {inline(line.slice(5))}
        </h5>,
      );
    } else if (line.startsWith("### ")) {
      blocks.push(
        <h4 key={index} className="pt-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-1">
          {inline(line.slice(4))}
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h3 key={index} className="pt-3 text-sm font-bold text-slate-900">
          {inline(line.slice(3))}
        </h3>,
      );
    } else if (line.startsWith("> ")) {
      blocks.push(
        <blockquote key={index} className="my-2 border-l-2 border-brand-500 bg-brand-50/50 px-2.5 py-1.5 text-xs italic text-slate-700 rounded-r">
          {inline(line.slice(2))}
        </blockquote>,
      );
    } else {
      blocks.push(<p key={index} className="leading-relaxed">{inline(line)}</p>);
    }
  }

  flushList();
  flushTable();
  flushCodeBlock();

  return <div className="space-y-2 text-xs sm:text-sm leading-relaxed text-slate-700">{blocks}</div>;
}
