import { ref } from "vue";

/**
 * Wraps an async function to automatically track loading string states and intercept errors.
 */
export function useAsyncState<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  defaultErrorMessage = "Operation failed",
) {
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function execute(...args: TArgs): Promise<TReturn | null> {
    loading.value = true;
    error.value = null;
    try {
      return await fn(...args);
    } catch (err) {
      error.value = err instanceof Error ? err.message : defaultErrorMessage;
      return null; // or you could throw if you prefer the caller to handle it too
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    execute,
  };
}
