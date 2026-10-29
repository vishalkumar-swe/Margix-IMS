import type { ReactNode } from "react";
import Link from "next/link";
import { Info, AlertTriangle, AlertCircle, Lightbulb, Hash } from "lucide-react";
import { MermaidDiagram } from "./mermaid-diagram";
import { CodeBlock } from "./code-block";
import { slugifyHeading } from "./doc-utils";

function inline(text: string): ReactNode[] {
  // Matches: **bold**, `code`, [link text](url), _italic_
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|_[^_]+_)/g;
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
        <code
          key={index}
          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-800 border border-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("[") && part.includes("](") && part.endsWith(")")) {
      const closingBracket = part.indexOf("](");
      const label = part.slice(1, closingBracket);
      const url = part.slice(closingBracket + 2, -1);
      // Strip internal file:/// path for clean web route if linking to docs
      let cleanUrl = url;
      if (cleanUrl.includes("docs/manual/")) {
        const match = cleanUrl.match(/docs\/manual\/([^#]+)\.md/);
        if (match) cleanUrl = `/docs/${match[1]}`;
      } else if (cleanUrl.includes("docs/MANUAL.md")) {
        cleanUrl = "/docs";
      }

      const isExternal = cleanUrl.startsWith("http");

      if (isExternal) {
        return (
          <a
            key={index}
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline decoration-brand-300 hover:text-brand-900 transition-colors"
          >
            {label}
          </a>
        );
      }

      return (
        <Link
          key={index}
          href={cleanUrl}
          className="font-medium text-brand-700 underline decoration-brand-300 hover:text-brand-900 transition-colors"
        >
          {label}
        </Link>
      );
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return (
        <em key={index} className="italic text-slate-700">
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

export function DocMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let tableLines: string[] = [];
  let alertType: "NOTE" | "TIP" | "IMPORTANT" | "WARNING" | null = null;
  let alertLines: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";

  const flushList = () => {
    if (listItems.length === 0) return;
    const items = listItems;
    const isNum = listOrdered;
    listItems = [];
    listOrdered = false;

    if (isNum) {
      blocks.push(
        <ol key={`list-${blocks.length}`} className="my-3 list-decimal space-y-1.5 pl-6 text-sm text-slate-700">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {inline(item)}
            </li>
          ))}
        </ol>,
      );
    } else {
      blocks.push(
        <ul key={`list-${blocks.length}`} className="my-3 list-disc space-y-1.5 pl-6 text-sm text-slate-700">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {inline(item)}
            </li>
          ))}
        </ul>,
      );
    }
  };

  const flushTable = () => {
    if (tableLines.length === 0) return;
    const rawRows = tableLines.map(parseTableRow);
    tableLines = [];

    if (rawRows.length < 2) return;

    const headers = rawRows[0];
    const dataRows = isTableDivider(rawRows[1]) ? rawRows.slice(2) : rawRows.slice(1);

    blocks.push(
      <div key={`table-${blocks.length}`} className="my-5 overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50/90 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-600">
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="px-4 py-3 whitespace-nowrap">
                  {inline(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {dataRows.map((row, rIdx) => (
              <tr key={rIdx} className={rIdx % 2 === 1 ? "bg-slate-50/40 hover:bg-slate-50" : "hover:bg-slate-50"}>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="px-4 py-3 text-slate-700 leading-relaxed">
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

  const flushAlert = () => {
    if (!alertType || alertLines.length === 0) return;
    const type = alertType;
    const content = alertLines.join(" ");
    alertType = null;
    alertLines = [];

    const config = {
      NOTE: {
        bg: "bg-blue-50/80 border-blue-200 text-blue-950",
        borderLeft: "border-l-4 border-l-blue-600",
        icon: Info,
        iconColor: "text-blue-600",
        title: "Operational Note",
      },
      TIP: {
        bg: "bg-emerald-50/80 border-emerald-200 text-emerald-950",
        borderLeft: "border-l-4 border-l-emerald-600",
        icon: Lightbulb,
        iconColor: "text-emerald-600",
        title: "Pro Tip / Best Practice",
      },
      IMPORTANT: {
        bg: "bg-purple-50/80 border-purple-200 text-purple-950",
        borderLeft: "border-l-4 border-l-purple-600",
        icon: AlertCircle,
        iconColor: "text-purple-600",
        title: "Essential Requirement",
      },
      WARNING: {
        bg: "bg-amber-50/80 border-amber-200 text-amber-950",
        borderLeft: "border-l-4 border-l-amber-600",
        icon: AlertTriangle,
        iconColor: "text-amber-600",
        title: "Statutory & Compliance Warning",
      },
    }[type];

    const Icon = config.icon;

    blocks.push(
      <div
        key={`alert-${blocks.length}`}
        className={`my-5 flex gap-3.5 rounded-xl border p-4 shadow-xs ${config.bg} ${config.borderLeft}`}
      >
        <Icon className={`size-5 shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="text-sm leading-relaxed">
          <p className="font-bold text-xs uppercase tracking-wide">{config.title}</p>
          <div className="mt-1">{inline(content)}</div>
        </div>
      </div>,
    );
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock && codeBlockLines.length === 0) return;
    const code = codeBlockLines.join("\n");
    const lang = codeBlockLang.toLowerCase().trim();
    codeBlockLines = [];
    inCodeBlock = false;
    codeBlockLang = "";

    // If it's a Mermaid diagram, render the interactive diagram!
    if (lang === "mermaid") {
      blocks.push(<MermaidDiagram key={`mermaid-${blocks.length}`} chart={code} />);
      return;
    }

    // Otherwise render standard code block with copy button
    blocks.push(<CodeBlock key={`code-${blocks.length}`} code={code} language={lang} />);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code blocks & Mermaid diagrams
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        flushTable();
        flushAlert();
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // GitHub alerts: > [!NOTE], > [!IMPORTANT], etc.
    const alertMatch = trimmed.match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    if (alertMatch) {
      flushList();
      flushTable();
      flushAlert();
      const rawType = alertMatch[1].toUpperCase();
      alertType = (rawType === "CAUTION" ? "WARNING" : rawType) as any;
      continue;
    }

    if (alertType && trimmed.startsWith(">")) {
      alertLines.push(trimmed.replace(/^>\s*/, ""));
      continue;
    } else if (alertType && !trimmed.startsWith(">") && trimmed.length > 0) {
      alertLines.push(trimmed);
      continue;
    } else if (alertType) {
      flushAlert();
    }

    // Tables
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      tableLines.push(trimmed);
      continue;
    } else if (tableLines.length > 0) {
      flushTable();
    }

    // Lists (unordered)
    const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      listOrdered = false;
      listItems.push(listMatch[1]);
      continue;
    }

    // Lists (ordered)
    const numListMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numListMatch) {
      listOrdered = true;
      listItems.push(numListMatch[1]);
      continue;
    }

    if (listItems.length > 0) {
      flushList();
    }

    // Blank line
    if (!trimmed) {
      continue;
    }

    // Horizontal rule
    if (/^---+$|^===+$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${blocks.length}`} className="my-8 border-slate-200" />);
      continue;
    }

    // Headers with IDs and hover anchor link
    if (trimmed.startsWith("# ")) {
      const headingText = trimmed.slice(2).trim();
      const id = slugifyHeading(headingText.replace(/\*\*/g, "").replace(/`/g, ""));
      blocks.push(
        <h1
          key={`h1-${blocks.length}`}
          id={id}
          className="group relative mt-10 mb-4 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl scroll-mt-24"
        >
          <a
            href={`#${id}`}
            className="absolute -left-6 top-1 hidden text-slate-400 group-hover:inline-block hover:text-brand-600"
            aria-label="Link to this section"
          >
            <Hash className="size-5" />
          </a>
          {inline(headingText)}
        </h1>,
      );
      continue;
    }

    if (trimmed.startsWith("## ")) {
      const headingText = trimmed.slice(3).trim();
      const id = slugifyHeading(headingText.replace(/\*\*/g, "").replace(/`/g, ""));
      blocks.push(
        <h2
          key={`h2-${blocks.length}`}
          id={id}
          className="group relative mt-9 mb-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl border-b border-slate-100 pb-2 scroll-mt-24"
        >
          <a
            href={`#${id}`}
            className="absolute -left-6 top-1 hidden text-slate-400 group-hover:inline-block hover:text-brand-600"
            aria-label="Link to this section"
          >
            <Hash className="size-4" />
          </a>
          {inline(headingText)}
        </h2>,
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      const headingText = trimmed.slice(4).trim();
      const id = slugifyHeading(headingText.replace(/\*\*/g, "").replace(/`/g, ""));
      blocks.push(
        <h3
          key={`h3-${blocks.length}`}
          id={id}
          className="group relative mt-7 mb-2 text-base font-bold text-slate-900 sm:text-lg scroll-mt-24"
        >
          <a
            href={`#${id}`}
            className="absolute -left-5 top-0.5 hidden text-slate-400 group-hover:inline-block hover:text-brand-600"
            aria-label="Link to this section"
          >
            <Hash className="size-3.5" />
          </a>
          {inline(headingText)}
        </h3>,
      );
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      const headingText = trimmed.slice(5).trim();
      const id = slugifyHeading(headingText.replace(/\*\*/g, "").replace(/`/g, ""));
      blocks.push(
        <h4
          key={`h4-${blocks.length}`}
          id={id}
          className="mt-5 mb-1.5 text-sm font-bold text-slate-900 scroll-mt-24"
        >
          {inline(headingText)}
        </h4>,
      );
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={`p-${blocks.length}`} className="my-3 text-sm leading-relaxed text-slate-700">
        {inline(trimmed)}
      </p>,
    );
  }

  flushList();
  flushTable();
  flushAlert();
  flushCodeBlock();

  return <div className="prose prose-slate max-w-none">{blocks}</div>;
}
