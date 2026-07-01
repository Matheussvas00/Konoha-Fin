import { Alert, Platform } from 'react-native';

/**
 * Confirmação que funciona tanto no app nativo (Alert com botões) quanto no
 * navegador. No react-native-web o `Alert.alert` com botões NÃO dispara os
 * callbacks (`onPress`), então usamos `window.confirm` na web.
 */
export function confirmAction(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const {
    title,
    message = '',
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    destructive = false,
    onConfirm,
  } = opts;

  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(text)
      : true;
    if (ok) void onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => { void onConfirm(); } },
  ]);
}
