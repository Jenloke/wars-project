import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cancel } from '../input/interaction';
import { session } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { openArea, tileBox } from './hudLayout';
import { Icon } from './SpriteSvg';

export interface MenuItem {
  readonly key: string;
  readonly label: string;
  /** Drawn before the label: an icon, or the art of what the item makes. */
  readonly icon?: ReactNode;
  readonly detail?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly onSelect: () => void;
}

interface MenuProps {
  readonly title: string;
  readonly items: readonly MenuItem[];
  /** Shown in the header beside the title, such as the funds to spend. */
  readonly aside?: ReactNode;
  readonly className?: string | undefined;
}

/** Gap between the anchor tile and the menu, in CSS pixels. */
const GAP = 8;
/** How far a menu opened low on the board rises above its tile's bottom. */
const LIFT = 48;

/**
 * A floating menu anchored beside the tile it was opened on. It takes keyboard
 * focus: arrow keys move between items, Enter picks, Escape goes back.
 */
export function Menu({ title, items, aside, className }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const camera = useUiStore((ui) => ui.camera);
  const viewport = useUiStore((ui) => ui.viewport);
  const menuTile = useUiStore((ui) => ui.menuTile);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus();
  }, [title]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? []),
    ];
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length]!.focus();
  };

  // The menu sits to the right of the tile, or to the left when the tile is in
  // the right half of the view, and below the HUD.
  const tile = tileBox(menuTile, session.getState().width, camera, viewport);
  const open = openArea(viewport);
  const viewWidth = viewport.width / viewport.dpr;
  const viewHeight = viewport.height / viewport.dpr;
  const onRight = tile.left + tile.width / 2 < viewWidth / 2;
  const low = tile.top > open.top + open.height / 2;

  return (
    <div
      ref={ref}
      className={className === undefined ? 'menu' : `menu ${className}`}
      role="menu"
      aria-label={title}
      onKeyDown={onKeyDown}
      style={{
        top: Math.max(open.top + GAP, Math.min(tile.top, viewHeight - GAP)),
        ...(onRight
          ? { left: Math.max(GAP, tile.left + tile.width + GAP) }
          : { right: Math.max(GAP, viewWidth - tile.left + GAP) }),
        // Keep tall menus on screen whatever the anchor row.
        transform: low ? `translateY(calc(-100% + ${LIFT}px))` : undefined,
      }}
    >
      <div className="menu-header">
        <span className="menu-title">{title}</span>
        {aside}
        <button
          type="button"
          className="menu-close"
          onClick={cancel}
          aria-label="Cancel"
          title="Cancel (Esc)"
        >
          <Icon name="close" />
        </button>
      </div>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className="menu-item"
          disabled={item.disabled}
          onClick={item.onSelect}
        >
          {item.icon !== undefined && <span className="menu-icon">{item.icon}</span>}
          <span className="menu-label">{item.label}</span>
          {item.detail !== undefined && <span className="menu-detail">{item.detail}</span>}
        </button>
      ))}
    </div>
  );
}
