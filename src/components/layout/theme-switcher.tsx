"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/cn";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

const REVEAL_MS = 550;
const FADE_MS = 300;

/** Applies a theme to every themed scope on the page and remembers it for a year. */
function applyTheme(theme: Theme): void {
  document.querySelectorAll<HTMLElement>("[data-theme]").forEach((el) => el.setAttribute("data-theme", theme));
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Switches with an animation: a circular reveal of the new theme from the
 * clicked button (View Transitions API), a short colour fade where that is
 * unsupported, and no animation when the user prefers reduced motion.
 */
function switchAnimated(event: MouseEvent<HTMLButtonElement>, change: () => void): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return change();

  if (!document.startViewTransition) {
    const root = document.documentElement;
    root.classList.add("theme-fade");
    change();
    window.setTimeout(() => root.classList.remove("theme-fade"), FADE_MS);
    return;
  }

  const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
  const x = left + width / 2;
  const y = top + height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(() => flushSync(change));
  transition.ready
    .then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      ),
    )
    .catch(() => {});
}

/**
 * Light / dark / follow-the-system switch. Applies at once to every themed
 * scope on the page and remembers the choice (cookie) so the server renders
 * it on the next visit.
 */
export function ThemeSwitcher({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState(initial);

  function choose(event: MouseEvent<HTMLButtonElement>, next: Theme) {
    if (next === theme) return;
    switchAnimated(event, () => {
      setTheme(next);
      applyTheme(next);
    });
  }

  return (
    <div role="radiogroup" aria-label="Colour theme" className="glass inline-flex rounded-lg border p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          onClick={(event) => choose(event, value)}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:text-slate-900",
            theme === value && "bg-brand-500 text-black hover:text-black",
          )}
        >
          <Icon className="size-4" aria-hidden />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
