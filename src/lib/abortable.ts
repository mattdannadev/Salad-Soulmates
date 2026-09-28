/** Bound a pending operation even when a dependency ignores AbortSignal. */
export default function abortable<T>(operation: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(operation);
  signal.throwIfAborted();
  let onAbort: () => void = () => undefined;
  const cancelled = new Promise<T>((_resolve, reject) => {
    onAbort = () => {
      const { reason }: { reason: unknown } = signal;
      reject(reason instanceof Error ? reason : new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  return Promise.race([Promise.resolve(operation), cancelled])
    .finally(() => signal.removeEventListener('abort', onAbort));
}
