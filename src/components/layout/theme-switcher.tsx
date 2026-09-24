"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/** Applies a theme to every themed scope on the page and remembers it for a year. */
function applyTheme(theme: Theme): void {
  document.querySelectorAll<HTMLElement>("[data-theme]").forEach((el) => el.setAttribute("data-theme", theme));
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Light / dark / follow-the-system switch. Applies at once to every themed
 * scope on the page and remembers the choice (cookie, one year) so the server
 * renders it on the next visit.
 */
export function ThemeSwitcher({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div role="radiogroup" aria-label="Colour theme" className="inline-flex rounded-md border border-slate-200 p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            "flex size-7 items-center justify-center rounded text-slate-500 transition-colors hover:text-slate-900",
            theme === value && "bg-slate-100 text-slate-900",
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
