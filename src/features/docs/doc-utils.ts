export interface TocItem {
  id: string;
  title: string;
  level: 2 | 3;
}

/**
 * Standardized slugifier for headings across DocMarkdown, Table of Contents, and deep links.
 */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Extracts table of contents items (h2 and h3) from raw markdown text.
 */
export function extractToc(markdown: string): TocItem[] {
  const lines = markdown.split("\n");
  const items: TocItem[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    if (trimmed.startsWith("## ")) {
      const rawTitle = trimmed.slice(3).trim();
      // Remove markdown bold or code wrapping if present in heading
      const cleanTitle = rawTitle.replace(/\*\*/g, "").replace(/`/g, "");
      items.push({
        id: slugifyHeading(cleanTitle),
        title: cleanTitle,
        level: 2,
      });
    } else if (trimmed.startsWith("### ")) {
      const rawTitle = trimmed.slice(4).trim();
      const cleanTitle = rawTitle.replace(/\*\*/g, "").replace(/`/g, "");
      items.push({
        id: slugifyHeading(cleanTitle),
        title: cleanTitle,
        level: 3,
      });
    }
  }

  return items;
}

