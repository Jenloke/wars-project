import { useUiStore } from './store/uiStore';
import { GameCanvas } from './ui/GameCanvas';
import { GameDialog } from './ui/GameDialog';
import { useKeyboardControls } from './ui/hooks';
import { InfoPanel } from './ui/InfoPanel';
import { Menus } from './ui/Menus';
import { GameOver, TurnBanner } from './ui/Overlays';
import { TopBar } from './ui/TopBar';

export function App() {
  useKeyboardControls();
  const dialogOpen = useUiStore((ui) => ui.dialogOpen);
  return (
    <div className="app">
      <TopBar />
      <main className="board">
        <GameCanvas />
        <Menus />
        <TurnBanner />
      </main>
      <InfoPanel />
      <GameOver />
      {dialogOpen && <GameDialog />}
    </div>
  );
}
