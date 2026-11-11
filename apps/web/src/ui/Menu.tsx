import { useEffect, useRef, type KeyboardEvent } from 'react';
import { cancel } from '../input/interaction';
import { tileSize } from '../render/camera';
import { session } from '../session/game';
import { useUiStore } from '../store/uiStore';

export interface MenuItem {
  readonly key: string;
  readonly label: string;
  readonly detail?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly onSelect: () => void;
}

interface MenuProps {
  readonly title: string;
  readonly items: readonly MenuItem[];
}

/** Gap between the anchor tile and the menu, in CSS pixels. */
const GAP = 8;

/**
 * A floating menu anchored beside the tile it was opened on. It takes keyboard
 * focus: arrow keys move between items, Enter picks, Escape goes back.
 */
export function Menu({ title, items }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const camera = useUiStore((ui) => ui.camera);
  const viewport = useUiStore((ui) => ui.viewport);
  const menuTile = useUiStore((ui) => ui.menuTile);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [title]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ];
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]!.focus();
  };

  // Tile position in CSS pixels within the map area. The menu sits to the right
  // of the tile, or to the left when the tile is in the right half of the view.
  const { width } = session.getState();
  const size = tileSize(camera, viewport);
  const toCss = 1 / viewport.dpr;
  const left = ((menuTile % width) * size - camera.x) * toCss;
  const top = (Math.floor(menuTile / width) * size - camera.y) * toCss;
  const viewWidth = viewport.width * toCss;
  const viewHeight = viewport.height * toCss;
  const onRight = left + (size * toCss) / 2 < viewWidth / 2;

  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={title}
      onKeyDown={onKeyDown}
      style={{
        top: Math.max(GAP, Math.min(top, viewHeight - GAP)),
        ...(onRight
          ? { left: Math.max(GAP, left + size * toCss + GAP) }
          : { right: Math.max(GAP, viewWidth - left + GAP) }),
        // Keep tall menus on screen whatever the anchor row.
        transform: top > viewHeight / 2 ? 'translateY(calc(-100% + 48px))' : undefined,
      }}
    >
      <div className="menu-title">{title}</div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className="menu-item"
          disabled={item.disabled}
          onClick={item.onSelect}
        >
          <span>{item.label}</span>
          {item.detail !== undefined && <span className="menu-detail">{item.detail}</span>}
        </button>
      ))}
      <button type="button" role="menuitem" className="menu-item menu-cancel" onClick={cancel}>
        Cancel
      </button>
    </div>
  );
}
