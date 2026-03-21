import { Platform } from 'react-native';

export function blurActiveElement() {
  if (Platform.OS !== 'web') {
    return;
  }

  const activeElement = globalThis.document?.activeElement as
    | { blur?: () => void }
    | null
    | undefined;

  activeElement?.blur?.();
}

export function runAfterBlur(action: () => void) {
  blurActiveElement();

  if (Platform.OS === 'web') {
    requestAnimationFrame(() => {
      action();
    });
    return;
  }

  action();
}
