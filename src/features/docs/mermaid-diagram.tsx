"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Eye, Maximize2, Minimize2, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";

interface MermaidDiagramProps {
  chart: string;
  title?: string;
}

export function MermaidDiagram({ chart, title }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showSource, setShowSource] = useState(false);

  const rawId = useId();
  const diagramId = `mermaid_${rawId.replace(/[:]/g, "_")}`;

  const cleanChart = chart.trim();

  // Detect diagram type
  const diagramType = (() => {
    const firstLine = cleanChart.split("\n")[0].trim().toLowerCase();
    if (firstLine.startsWith("flowchart") || firstLine.startsWith("graph")) return "Flowchart";
    if (firstLine.startsWith("sequencediagram")) return "Sequence Diagram";
    if (firstLine.startsWith("statediagram")) return "State Diagram";
    if (firstLine.startsWith("classdiagram")) return "Class Diagram";
    if (firstLine.startsWith("erdiagram")) return "ER Diagram";
    return "Architecture Diagram";
  })();

  useEffect(() => {
    let cancelled = false;

    async function renderChart() {
      setIsLoading(true);
      setError(null);
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "loose",
          themeVariables: {
            primaryColor: "#0284c7",
            primaryTextColor: "#0f172a",
            primaryBorderColor: "#38bdf8",
            lineColor: "#64748b",
            secondaryColor: "#f1f5f9",
            tertiaryColor: "#f8fafc",
            noteBkgColor: "#fef3c7",
            noteTextColor: "#92400e",
            fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
            fontSize: "13px",
          },
          flowchart: {
            useMaxWidth: false,
            htmlLabels: true,
            curve: "basis",
          },
          sequence: {
            useMaxWidth: false,
            showSequenceNumbers: true,
          },
        });

        // Unique ID for mermaid render
        const renderId = `${diagramId}_${Date.now()}`;
        const { svg } = await mermaid.render(renderId, cleanChart);

        if (!cancelled) {
          setSvgContent(svg);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Mermaid render error:", err);
          setError(err?.message || "Failed to render diagram");
          setIsLoading(false);
        }
      }
    }

    renderChart();

    return () => {
      cancelled = true;
    };
  }, [cleanChart, diagramId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanChart);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const resetZoom = () => setZoom(1);
  const zoomIn = () => setZoom((z) => Math.min(z + 0.25, 2.5));
  const zoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));

  return (
    <figure
      className={`my-6 rounded-xl border border-slate-200 bg-white shadow-xs transition-all overflow-hidden ${
        isFullscreen ? "fixed inset-4 z-50 flex flex-col bg-white shadow-2xl p-4 sm:p-6" : ""
      }`}
    >
      {/* Diagram Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/75 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            {diagramType}
          </span>
          {title && <span className="text-xs font-medium text-slate-700 truncate max-w-xs">{title}</span>}
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom Controls */}
          {!error && !showSource && !isLoading && (
            <div className="hidden sm:flex items-center gap-0.5 mr-2 border-r border-slate-200 pr-2">
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoom <= 0.5}
                title="Zoom Out"
                className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
              >
                <ZoomOut className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                title="Reset Zoom"
                className="rounded px-1.5 py-0.5 font-mono text-[10px] text-slate-600 hover:bg-slate-200"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={zoomIn}
                disabled={zoom >= 2.5}
                title="Zoom In"
                className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
              >
                <ZoomIn className="size-3.5" />
              </button>
            </div>
          )}

          {/* Toggle Raw Source */}
          <button
            type="button"
            onClick={() => setShowSource(!showSource)}
            title={showSource ? "View Rendered Diagram" : "View Diagram Source"}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              showSource ? "bg-slate-200 text-slate-900" : "text-slate-600 hover:bg-slate-200/70"
            }`}
          >
            <Eye className="size-3.5" />
            <span className="hidden sm:inline">{showSource ? "Diagram" : "Source"}</span>
          </button>

          {/* Copy Source */}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy Diagram Source"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/70 transition-colors"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-semibold">Copied</span>
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen View"}
            className="inline-flex items-center rounded-md p-1 text-slate-600 hover:bg-slate-200/70"
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Diagram Canvas or Raw Code View */}
      <div
        ref={containerRef}
        className={`relative flex-1 overflow-x-auto p-4 sm:p-6 flex items-center justify-center bg-slate-50/30 ${
          isFullscreen ? "min-h-[500px]" : "min-h-[220px]"
        }`}
      >
        {isLoading && (
          <div className="flex flex-col items-center gap-2 py-12 text-slate-400">
            <RefreshCw className="size-5 animate-spin text-brand-600" />
            <span className="text-xs font-medium">Rendering diagram...</span>
          </div>
        )}

        {error && !showSource && (
          <div className="flex flex-col items-center gap-3 py-8 text-center max-w-md">
            <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200">
              Unable to render diagram dynamically in this view.
            </p>
            <pre className="w-full text-left bg-slate-900 text-slate-200 p-3 rounded-lg text-xs font-mono overflow-x-auto">
              <code>{cleanChart}</code>
            </pre>
          </div>
        )}

        {showSource && (
          <div className="w-full">
            <pre className="w-full text-left bg-slate-900 text-slate-200 p-4 rounded-lg text-xs font-mono overflow-x-auto">
              <code>{cleanChart}</code>
            </pre>
          </div>
        )}

        {!isLoading && !error && !showSource && svgContent && (
          <div
            className="w-full flex justify-center transition-transform duration-150 origin-center select-none"
            style={{ transform: `scale(${zoom})` }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        )}
      </div>

      {/* Diagram Caption / Footer Note */}
      <figcaption className="border-t border-slate-100 bg-white px-4 py-2 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Interactive Diagram · Margix Architecture Engine</span>
        {zoom !== 1 && (
          <button
            type="button"
            onClick={resetZoom}
            className="text-brand-600 hover:text-brand-800 font-medium"
          >
            Reset view
          </button>
        )}
      </figcaption>
    </figure>
  );
}

