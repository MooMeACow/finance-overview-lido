/**
 * Cross-platform dialogs. React Native's Alert does not show dialogs in the
 * browser, so on web these use the app's own dialog (DialogHost), falling back to
 * the browser's confirm/alert if the host isn't mounted.
 */
import { Alert, Platform } from 'react-native';

export type DialogRequest = {
  title: string;
  message: string;
  /** Present for a confirmation; absent for a plain notice */
  confirmLabel?: string;
  tone: 'danger' | 'default';
  resolve: (ok: boolean) => void;
};

let host: ((req: DialogRequest) => void) | null = null;

/** Registers the component that shows dialogs on web. Returns an unregister function. */
export function setDialogHost(show: (req: DialogRequest) => void): () => void {
  host = show;
  return () => {
    if (host === show) host = null;
  };
}

export function confirmAction(title: string, message: string, confirmLabel: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (host) {
      const show = host;
      return new Promise((resolve) =>
        show({ title, message, confirmLabel, tone: /delete|remove/i.test(confirmLabel) ? 'danger' : 'default', resolve }),
      );
    }
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function notify(title: string, message: string): void {
  if (Platform.OS === 'web') {
    if (host) {
      host({ title, message, tone: 'default', resolve: () => {} });
      return;
    }
    if (typeof window !== 'undefined') window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
