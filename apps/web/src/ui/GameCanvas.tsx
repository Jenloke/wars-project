import { loadAtlas } from '@tactics/sprites';
import { useEffect, useRef, useState } from 'react';
import { cancel, clickTile, moveCursor, panBy, zoomBy } from '../input/interaction';
import { clampCamera, tileAtPoint } from '../render/camera';
import { playback } from '../render/playback';
import { createRenderer, idleFrameAt } from '../render/renderer';
import { ruleset, session } from '../session/game';
import { IDLE_SELECTION, useUiStore } from '../store/uiStore';

/** Pointer travel, in CSS pixels, before a press becomes a pan instead of a click. */
const DRAG_THRESHOLD = 6;

/**
 * The map canvas. React only mounts it; drawing runs in a `requestAnimationFrame`
 * loop that redraws when something changed, so an idle board costs nothing.
 */
export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let disposed = false;
    let frameHandle = 0;
    let dirty = true;
    const markDirty = () => {
      dirty = true;
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      canvas.width = width;
      canvas.height = height;
      const viewport = { width, height, dpr };
      const state = session.getState();
      const camera = clampCamera(useUiStore.getState().camera, viewport, state.width, state.height);
      useUiStore.setState({ viewport, camera });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const unsubscribeUi = useUiStore.subscribe(markDirty);
    const unsubscribeState = session.subscribe(() => {
      // Any applied action or new game invalidates the current selection.
      const state = session.getState();
      const { camera, viewport, mode } = useUiStore.getState();
      useUiStore.setState({
        ...(mode === 'idle' ? null : IDLE_SELECTION),
        camera: clampCamera(camera, viewport, state.width, state.height),
      });
      markDirty();
    });
    const unsubscribeEvents = session.onEvents((previous, next, events) => {
      playback.play(previous, next, events, performance.now());
      if (playback.active) useUiStore.setState({ animating: true });
    });

    void Promise.all([loadAtlas(1), loadAtlas(2)]).then(
      ([atlas1, atlas2]) => {
        if (disposed) return;
        const renderer = createRenderer(canvas, ruleset, { 1: atlas1, 2: atlas2 });
        let lastIdleFrame = -1;
        const frame = (time: number) => {
          const wasAnimating = playback.active;
          const animating = playback.update(time);
          if (wasAnimating && !animating) useUiStore.setState({ animating: false });
          const idleFrame = idleFrameAt(time);
          if (dirty || animating || wasAnimating || idleFrame !== lastIdleFrame) {
            dirty = false;
            lastIdleFrame = idleFrame;
            renderer.render({
              state: session.getState(),
              ui: useUiStore.getState(),
              playback,
              time,
            });
          }
          frameHandle = requestAnimationFrame(frame);
        };
        frameHandle = requestAnimationFrame(frame);
      },
      (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)),
    );

    return () => {
      disposed = true;
      cancelAnimationFrame(frameHandle);
      observer.disconnect();
      unsubscribeUi();
      unsubscribeState();
      unsubscribeEvents();
      playback.stop();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    /** Converts a pointer position to canvas device pixels. */
    const toCanvas = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = canvas.width / rect.width;
      return {
        x: (event.clientX - rect.left) * ratio,
        y: (event.clientY - rect.top) * ratio,
        ratio,
      };
    };
    const tileUnder = (event: { clientX: number; clientY: number }) => {
      const point = toCanvas(event);
      const { camera, viewport } = useUiStore.getState();
      const state = session.getState();
      return tileAtPoint(camera, viewport, point.x, point.y, state.width, state.height);
    };

    let pressed = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent) => {
      pressed = true;
      dragging = false;
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!pressed) {
        if (event.pointerType === 'mouse') moveCursor(tileUnder(event));
        return;
      }
      if (!dragging) {
        const travel = Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY);
        if (travel < DRAG_THRESHOLD) return;
        dragging = true;
      }
      const { ratio } = toCanvas(event);
      panBy((lastX - event.clientX) * ratio, (lastY - event.clientY) * ratio);
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      canvas.releasePointerCapture(event.pointerId);
      if (dragging) return;
      if (event.button === 2) cancel();
      else if (event.button === 0) clickTile(tileUnder(event));
    };
    const onPointerCancel = () => {
      pressed = false;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = toCanvas(event);
      zoomBy(event.deltaY < 0 ? 1 : -1, point.x, point.y);
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="game-canvas" aria-label="Game map" />
      {error !== null && <p className="load-error">{error}</p>}
    </>
  );
}
