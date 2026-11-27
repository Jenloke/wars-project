import { openBrowserStorage, type KeyValueStorage } from '../saves/saveStore';
import { useUiStore } from '../store/uiStore';

/** The colours the interface and the board's surroundings are drawn in. */
export type Theme = 'light' | 'dark';

/** What the player picked: a theme, or whichever the system prefers. */
export type ThemeChoice = 'system' | Theme;

/** The order the theme switch steps through. */
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', 'light', 'dark'];

export const THEME_LABELS: Readonly<Record<ThemeChoice, string>> = {
  system: 'Theme: follow the system',
  light: 'Theme: light',
  dark: 'Theme: dark',
};

const STORAGE_KEY = 'tactics.theme';

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

export function nextThemeChoice(choice: ThemeChoice): ThemeChoice {
  return THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length]!;
}

/** A stored choice, or `system` for anything else (nothing stored, or junk). */
export function parseThemeChoice(value: string | null): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === value) ?? 'system';
}

function readChoice(storage: KeyValueStorage | null): ThemeChoice {
  try {
    return parseThemeChoice(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return 'system';
  }
}

function writeChoice(storage: KeyValueStorage | null, choice: ThemeChoice): void {
  try {
    if (choice === 'system') storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, choice);
  } catch {
    // The choice then lasts until the page closes.
  }
}

/** The page's colours follow `data-theme` on the root element (see styles.css). */
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

let systemQuery: MediaQueryList | null = null;

function systemIsDark(): boolean {
  return systemQuery?.matches ?? true;
}

/**
 * Picks the saved theme (or the system's), applies it before the first paint,
 * and keeps it up to date as the player switches or the system changes.
 */
export function startTheme(): void {
  const storage = openBrowserStorage();
  systemQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const themeChoice = readChoice(storage);
  const theme = resolveTheme(themeChoice, systemIsDark());
  useUiStore.setState({ themeChoice, theme });
  applyTheme(theme);

  systemQuery.addEventListener('change', () => {
    const { themeChoice: choice } = useUiStore.getState();
    useUiStore.setState({ theme: resolveTheme(choice, systemIsDark()) });
  });
  useUiStore.subscribe((ui, previous) => {
    if (ui.themeChoice !== previous.themeChoice) writeChoice(storage, ui.themeChoice);
    if (ui.theme !== previous.theme) applyTheme(ui.theme);
  });
}

/** Steps the theme switch: system, light, dark, and round again. */
export function cycleTheme(): void {
  const themeChoice = nextThemeChoice(useUiStore.getState().themeChoice);
  useUiStore.setState({ themeChoice, theme: resolveTheme(themeChoice, systemIsDark()) });
}
