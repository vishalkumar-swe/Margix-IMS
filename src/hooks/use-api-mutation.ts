"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ApiClientError } from "@/lib/api-client";

/**
 * Tracks a single API mutation: pending flag, error and per-field validation
 * messages. An expired session sends the user to the login page.
 */
export function useApiMutation<TInput, TResult>(request: (input: TInput) => Promise<TResult>) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);

  async function mutate(input: TInput): Promise<TResult | undefined> {
    setPending(true);
    setError(null);
    try {
      return await request(input);
    } catch (cause) {
      const apiError =
        cause instanceof ApiClientError
          ? cause
          : new ApiClientError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection.", null);
      if (apiError.code === "UNAUTHENTICATED") {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
      }
      setError(apiError);
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return {
    mutate,
    pending,
    error,
    fieldErrors: error?.fieldErrors ?? {},
    reset: () => setError(null),
  };
}
