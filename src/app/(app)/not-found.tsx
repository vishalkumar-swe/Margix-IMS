import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <div className="glass rounded-xl border">
      <EmptyState
        icon={FileQuestion}
        title="Not found"
        description="The record you are looking for does not exist or was removed."
        action={
          <Link href="/" className={buttonVariants({ variant: "secondary" })}>
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
