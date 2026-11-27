import { describe, expect, it } from 'vitest';
import { nextThemeChoice, parseThemeChoice, resolveTheme, THEME_CHOICES } from '../src/ui/theme';

describe('the theme', () => {
  it('follows the system until the player picks one', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('steps through system, light and dark, and round again', () => {
    expect(THEME_CHOICES.map(nextThemeChoice)).toEqual(['light', 'dark', 'system']);
  });

  it('reads a stored choice, and falls back to the system for anything else', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice(null)).toBe('system');
    expect(parseThemeChoice('sepia')).toBe('system');
  });
});
