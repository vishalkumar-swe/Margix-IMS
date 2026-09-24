import Image from "next/image";
import { cn } from "@/lib/cn";

/** Source files live in public/brand (also used by e-mails and printouts). */
const VARIANTS = {
  /** "MargixIndia" wordmark: app header and sidebar. */
  wordmark: { src: "margix-wordmark", width: 887, height: 160 },
  /** Mark, wordmark and "Move • Connect • Grow": login page and letterheads. */
  full: { src: "margix-logo", width: 1200, height: 632 },
  /** Arrow mark alone: compact spaces. */
  mark: { src: "margix-mark", width: 512, height: 512 },
} as const;

export function BrandLogo({
  variant = "wordmark",
  className,
  priority,
}: {
  variant?: keyof typeof VARIANTS;
  /** Size it with a height or width class, e.g. "h-7 w-auto". */
  className?: string;
  priority?: boolean;
}) {
  const { src, width, height } = VARIANTS[variant];
  // Both versions are rendered; CSS shows the one matching the theme (white
  // lettering on dark). Printouts have no theme scope and use the standard logo.
  return (
    <>
      <Image
        src={`/brand/${src}.png`}
        alt="Margix India"
        width={width}
        height={height}
        priority={priority}
        className={cn("brand-logo-light w-auto", className)}
      />
      <Image
        src={`/brand/${src}-dark.png`}
        alt="Margix India"
        width={width}
        height={height}
        priority={priority}
        className={cn("brand-logo-dark w-auto", className)}
      />
    </>
  );
}
