/** A short note after an action ("Plan saved"). Shown by ToastHost; silently skipped if it isn't mounted. */
export type ToastKind = 'saved' | 'removed';
export type ToastRequest = { id: number; text: string; kind: ToastKind };

let host: ((t: ToastRequest) => void) | null = null;
let next = 1;

export function setToastHost(show: (t: ToastRequest) => void): () => void {
  host = show;
  return () => {
    if (host === show) host = null;
  };
}

export function toast(text: string, kind: ToastKind = 'saved'): void {
  host?.({ id: next++, text, kind });
}
