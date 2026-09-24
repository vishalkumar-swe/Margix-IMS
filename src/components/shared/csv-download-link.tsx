import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Downloads a report as CSV from its /api/v1 endpoint (same filters as the
 * page). A plain anchor: the browser sends the session cookie and saves the file.
 */
export function CsvDownloadLink({ href }: { href: string }) {
  return (
    <a href={href} className={buttonVariants({ variant: "secondary" })} download>
      <Download aria-hidden /> Download CSV
    </a>
  );
}
