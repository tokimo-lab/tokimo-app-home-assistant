import type { ConnStatus, SseEvent } from "../types";
import { sseUrl } from "./client";

export type SseHandler = (event: SseEvent) => void;
export type StatusHandler = (status: ConnStatus) => void;

/**
 * Opens an EventSource to the instance event stream.
 * Returns a dispose function that closes the connection.
 */
export function createInstanceEventStream(
  instanceId: string,
  onEvent: SseHandler,
  onStatus: StatusHandler,
): () => void {
  const url = sseUrl(
    `/instances/${encodeURIComponent(instanceId)}/events`,
  );
  let es: EventSource | null = new EventSource(url, { withCredentials: true });
  let closed = false;

  onStatus("connecting");

  es.addEventListener("message", (e: MessageEvent<string>) => {
    try {
      const parsed = JSON.parse(e.data) as SseEvent;
      onEvent(parsed);
    } catch {
      // ignore malformed frames
    }
  });

  // Named events matching the backend contract
  for (const evtType of [
    "snapshot",
    "updated",
    "removed",
    "status",
    "resync",
  ] as const) {
    es.addEventListener(evtType, (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as SseEvent;
        onEvent({ type: evtType, ...data } as SseEvent);
      } catch {
        // ignore
      }
    });
  }

  es.onerror = () => {
    if (closed) return;
    onStatus("connecting"); // will auto-reconnect
  };

  es.onopen = () => {
    if (closed) {
      es?.close();
      return;
    }
    onStatus("connected");
  };

  return () => {
    closed = true;
    es?.close();
    es = null;
  };
}
