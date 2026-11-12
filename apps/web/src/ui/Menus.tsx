import { getBuildOptions } from '@tactics/engine';
import { chooseBuild, chooseCommand, chooseUnload, endTurn, resign } from '../input/interaction';
import { ruleset } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { useGameState } from './hooks';
import { Menu, type MenuItem } from './Menu';

function ActionMenu() {
  const state = useGameState();
  const options = useUiStore((ui) => ui.options);
  if (options === null) return null;

  const items: MenuItem[] = [];
  if (options.attackTargets.length > 0) {
    items.push({ key: 'attack', label: 'Attack', onSelect: () => chooseCommand('attack') });
  }
  if (options.canCapture) {
    items.push({ key: 'capture', label: 'Capture', onSelect: () => chooseCommand('capture') });
  }
  if (options.canSupply) {
    items.push({ key: 'supply', label: 'Supply', onSelect: () => chooseCommand('supply') });
  }
  if (options.canJoin) {
    items.push({ key: 'join', label: 'Join', onSelect: () => chooseCommand('join') });
  }
  if (options.canLoad) {
    items.push({ key: 'load', label: 'Load', onSelect: () => chooseCommand('load') });
  }
  for (const unload of options.unloads) {
    const cargo = state.units[unload.cargo];
    if (cargo === undefined) continue;
    items.push({
      key: `unload-${unload.cargo}`,
      label: `Unload ${ruleset.units[cargo.type]!.name}`,
      onSelect: () => chooseUnload(unload.cargo),
    });
  }
  if (options.canWait) {
    items.push({ key: 'wait', label: 'Wait', onSelect: () => chooseCommand('wait') });
  }
  return <Menu title="Orders" items={items} />;
}

function BuildMenu() {
  const state = useGameState();
  const menuTile = useUiStore((ui) => ui.menuTile);
  const items = getBuildOptions(ruleset, state, menuTile).map((option) => ({
    key: String(option.unitType),
    label: ruleset.units[option.unitType]!.name,
    detail: option.cost.toLocaleString(),
    disabled: !option.affordable,
    onSelect: () => chooseBuild(option.unitType),
  }));
  return <Menu title="Build" items={items} />;
}

function MapMenu() {
  const items: MenuItem[] = [
    { key: 'end', label: 'End turn', onSelect: endTurn },
    {
      key: 'resign',
      label: 'Resign',
      onSelect: () => {
        if (window.confirm('Resign and concede the game?')) resign();
      },
    },
  ];
  return <Menu title="Command" items={items} />;
}

/** Shows whichever menu the current interaction mode calls for. */
export function Menus() {
  const mode = useUiStore((ui) => ui.mode);
  if (mode === 'actionMenu') return <ActionMenu />;
  if (mode === 'buildMenu') return <BuildMenu />;
  if (mode === 'mapMenu') return <MapMenu />;
  return null;
}
