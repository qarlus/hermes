import { useEffect, useRef } from "react";

type UseBufferedTerminalInputOptions = {
  onFlush: (sessionId: string, chunk: string) => Promise<void>;
  onError: (error: unknown) => void;
};

export function useBufferedTerminalInput({
  onFlush,
  onError
}: UseBufferedTerminalInputOptions) {
  const pendingInputRef = useRef<Map<string, string>>(new Map());
  const inputFlushTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    return () => {
      inputFlushTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      inputFlushTimersRef.current.clear();
      pendingInputRef.current.clear();
    };
  }, []);

  const queueTerminalInput = (sessionId: string, data: string) => {
    const nextChunk = (pendingInputRef.current.get(sessionId) ?? "") + data;
    pendingInputRef.current.set(sessionId, nextChunk);

    if (inputFlushTimersRef.current.has(sessionId)) {
      return;
    }

    const timer = window.setTimeout(() => {
      inputFlushTimersRef.current.delete(sessionId);
      const chunk = pendingInputRef.current.get(sessionId);
      if (!chunk) {
        return;
      }

      pendingInputRef.current.delete(sessionId);
      void onFlush(sessionId, chunk).catch(onError);
    }, 0);

    inputFlushTimersRef.current.set(sessionId, timer);
  };

  const clearTerminalInput = (sessionId: string) => {
    const timer = inputFlushTimersRef.current.get(sessionId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      inputFlushTimersRef.current.delete(sessionId);
    }

    pendingInputRef.current.delete(sessionId);
  };

  return { clearTerminalInput, queueTerminalInput };
}
