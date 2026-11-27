import { canActivatePower, getBuildOptions } from '@tactics/engine';
import {
  activatePower,
  chooseBuild,
  chooseCommand,
  chooseUnload,
  endTurn,
  openGameDialog,
  openNewGameDialog,
  resign,
  type UnitCommand,
} from '../input/interaction';
import { armiesOf } from '../session/armies';
import { ruleset } from '../session/game';
import { useUiStore } from '../store/uiStore';
import { useGameState } from './hooks';
import type { IconName } from './icons';
import { Menu, type MenuItem } from './Menu';
import { unitArt } from './spriteArt';
import { Icon, SpriteSvg } from './SpriteSvg';

/** The unit orders in the order the menu lists them, with their labels and icons. */
const ORDERS: readonly (readonly [UnitCommand, string, IconName])[] = [
  ['attack', 'Attack', 'attack'],
  ['capture', 'Capture', 'capture'],
  ['supply', 'Supply', 'supply'],
  ['dive', 'Dive', 'dive'],
  ['surface', 'Surface', 'surface'],
  ['join', 'Join', 'join'],
  ['load', 'Load', 'load'],
];

function ActionMenu() {
  const state = useGameState();
  const options = useUiStore((ui) => ui.options);
  const unit = useUiStore((ui) => ui.selectedUnit);
  if (options === null) return null;
  const owner = state.units[unit]?.owner ?? state.activePlayer;
  const army = armiesOf(ruleset, state)[owner]!;

  const available: Readonly<Record<UnitCommand, boolean>> = {
    attack: options.attackTargets.length > 0,
    capture: options.canCapture,
    supply: options.canSupply,
    dive: options.canDive,
    surface: options.canSurface,
    join: options.canJoin,
    load: options.canLoad,
    wait: options.canWait,
  };
  const items: MenuItem[] = ORDERS.filter(([command]) => available[command]).map(
    ([command, label, icon]) => ({
      key: command,
      label,
      icon: <Icon name={icon} ramp={army.ramp} />,
      onSelect: () => chooseCommand(command),
    }),
  );
  for (const unload of options.unloads) {
    const cargo = state.units[unload.cargo];
    if (cargo === undefined) continue;
    items.push({
      key: `unload-${unload.cargo}`,
      label: `Unload ${ruleset.units[cargo.type]!.name}`,
      icon: <SpriteSvg sprite={unitArt(ruleset, cargo.type)} ramp={army.ramp} />,
      onSelect: () => chooseUnload(unload.cargo),
    });
  }
  if (available.wait) {
    items.push({
      key: 'wait',
      label: 'Wait',
      icon: <Icon name="wait" />,
      onSelect: () => chooseCommand('wait'),
    });
  }
  return <Menu title="Orders" items={items} />;
}

function BuildMenu() {
  const state = useGameState();
  const menuTile = useUiStore((ui) => ui.menuTile);
  const army = armiesOf(ruleset, state)[state.activePlayer]!;
  const funds = state.players[state.activePlayer]!.funds;
  const items = getBuildOptions(ruleset, state, menuTile).map((option) => ({
    key: String(option.unitType),
    label: ruleset.units[option.unitType]!.name,
    icon: <SpriteSvg sprite={unitArt(ruleset, option.unitType)} ramp={army.ramp} />,
    detail: option.cost.toLocaleString(),
    disabled: !option.affordable,
    onSelect: () => chooseBuild(option.unitType),
  }));
  return (
    <Menu
      title="Build"
      className="build-menu"
      items={items}
      aside={
        <span className="stat menu-funds" title="Funds">
          <Icon name="funds" />
          {funds.toLocaleString()}
        </span>
      }
    />
  );
}

function MapMenu() {
  const state = useGameState();
  const power = ruleset.commanders[state.players[state.activePlayer]!.commander]!.power;
  const items: MenuItem[] = [];
  if (power !== null && canActivatePower(ruleset, state)) {
    items.push({
      key: 'power',
      label: power.name,
      icon: <Icon name="power" />,
      onSelect: activatePower,
    });
  }
  items.push(
    { key: 'end', label: 'End turn', icon: <Icon name="endTurn" mono />, onSelect: endTurn },
    { key: 'saves', label: 'Save and load', icon: <Icon name="save" />, onSelect: openGameDialog },
    {
      key: 'new',
      label: 'New game…',
      icon: <Icon name="newGame" />,
      onSelect: openNewGameDialog,
    },
    {
      key: 'resign',
      label: 'Resign',
      icon: <Icon name="resign" />,
      onSelect: () => {
        if (window.confirm('Resign and concede the game?')) resign();
      },
    },
  );
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
