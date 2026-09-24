import Image from "next/image";
import { cn } from "@/lib/cn";

/** Source files live in public/brand (also used by e-mails and printouts). */
const VARIANTS = {
  /** "MargixIndia" wordmark: app header and sidebar. */
  wordmark: { src: "/brand/margix-wordmark.png", width: 887, height: 160 },
  /** Mark, wordmark and "Move • Connect • Grow": login page and letterheads. */
  full: { src: "/brand/margix-logo.png", width: 1200, height: 632 },
  /** Arrow mark alone: compact spaces. */
  mark: { src: "/brand/margix-mark.png", width: 512, height: 512 },
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
  return <Image src={src} alt="Margix India" width={width} height={height} priority={priority} className={cn("w-auto", className)} />;
}
