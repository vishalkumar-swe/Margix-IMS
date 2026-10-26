"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { ApiClientError } from "@/lib/api-client";
import { emitApiError } from "@/lib/copilot/runtime";

export interface UseApiMutationOptions<TResult> {
  /**
   * Confirmation shown as a toast once the mutation succeeds — the piece a
   * dialog that simply closes leaves out.
   */
  successMessage?: string | ((result: TResult) => string);
}

/**
 * Tracks a single API mutation: pending flag, error and per-field validation
 * messages. An expired session sends the user to the login page.
 */
export function useApiMutation<TInput, TResult>(
  request: (input: TInput) => Promise<TResult>,
  options: UseApiMutationOptions<TResult> = {},
) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiClientError | null>(null);
  const { successMessage } = options;

  async function mutate(input: TInput): Promise<TResult | undefined> {
    setPending(true);
    setError(null);
    try {
      const result = await request(input);
      if (successMessage) {
        toast.success(typeof successMessage === "function" ? successMessage(result) : successMessage);
      }
      return result;
    } catch (cause) {
      const apiError =
        cause instanceof ApiClientError
          ? cause
          : new ApiClientError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection.", null);
      if (apiError.code === "UNAUTHENTICATED") {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
      }
      emitApiError(apiError, pathname);
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
