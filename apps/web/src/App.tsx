import { useUiStore } from './store/uiStore';
import { CommandBar } from './ui/CommandBar';
import { GameCanvas } from './ui/GameCanvas';
import { GameDialog } from './ui/GameDialog';
import { useKeyboardControls } from './ui/hooks';
import { InfoPanel } from './ui/InfoPanel';
import { Menus } from './ui/Menus';
import { NewGameDialog } from './ui/NewGameDialog';
import { GameOver, PowerBanner, TurnBanner } from './ui/Overlays';

/** The map fills the window; the HUD, menus and banners float over it. */
export function App() {
  useKeyboardControls();
  const dialogOpen = useUiStore((ui) => ui.dialogOpen);
  const dialog = useUiStore((ui) => ui.dialog);
  return (
    <div className="app">
      <CommandBar />
      <main className="board">
        <GameCanvas />
        <Menus />
        <TurnBanner />
        <PowerBanner />
      </main>
      <InfoPanel />
      <GameOver />
      {dialogOpen && (dialog === 'newGame' ? <NewGameDialog /> : <GameDialog />)}
    </div>
  );
}
