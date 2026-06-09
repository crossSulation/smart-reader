export interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  action: string;
}

export const READER_SHORTCUTS: ShortcutDef[] = [
  { key: 'ArrowRight', action: 'reader.nextPage' },
  { key: 'j', action: 'reader.nextPage' },
  { key: 'ArrowLeft', action: 'reader.prevPage' },
  { key: 'k', action: 'reader.prevPage' },
  { key: 'b', ctrl: true, action: 'reader.togglePanel' },
  { key: 'Slash', action: 'reader.focusSearch' },
  { key: 'n', ctrl: true, action: 'reader.createNote' },
  { key: 'f', ctrl: true, shift: true, action: 'reader.toggleFullscreen' },
  { key: 'KeyD', ctrl: true, shift: true, action: 'global.toggleDarkMode' },
  { key: 'F11', action: 'reader.toggleFullscreen' },
];
