import { useEffect, type RefObject } from 'react';

type ActionHandler = () => void;

export interface ShortcutBinding {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  handler: ActionHandler;
}

const tagNames = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function useKeyboardShortcuts(
  bindings: ShortcutBinding[],
  containerRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (containerRef?.current && !containerRef.current.contains(e.target as Node)) return;

      for (const { key, ctrl, shift, meta, handler } of bindings) {
        if (e.key !== key && e.code !== key) continue;
        if (Boolean(ctrl) !== (e.ctrlKey || e.metaKey)) continue;
        if (Boolean(shift) !== e.shiftKey) continue;
        if (Boolean(meta) !== e.metaKey) continue;

        const tag = (e.target as HTMLElement)?.tagName;
        const editable = tagNames.has(tag) || (e.target as HTMLElement)?.isContentEditable;

        if (key === 'Slash' || key === '/') {
          if (editable) continue;
          e.preventDefault();
          handler();
          return;
        }

        if (editable) continue;

        e.preventDefault();
        handler();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [bindings, containerRef]);
}
