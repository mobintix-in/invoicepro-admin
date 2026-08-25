"use client";

import createGlobe from "cobe";
import { useEffect, useRef, useState } from "react";
import type { GlobePoint } from "@/lib/live";

/**
 * The dotted globe on Live View: one marker per place a session came from in the
 * last 24 hours, spinning slowly and draggable.
 *
 * Rendered with `cobe` (~5KB WebGL) rather than a map library — it ships its own
 * landmass data, so the whole thing stays self-contained with no tiles, no map
 * API key and no external requests.
 */

// Admin palette, as cobe's 0–1 RGB triples.
const GOLD_500: [number, number, number] = [0.133, 0.271, 0.549]; // #22458cff
// Somewhere a session came from earlier in the window, but nobody is there now.
const DORMANT: [number, number, number] = [0.78, 0.75, 0.7];

/**
 * Dot size for a place, from its absolute session count — deliberately NOT from
 * its share of the busiest place: with a single location that share is always 1,
 * so every dot rendered at maximum size and the globe showed one fat blob.
 *
 * Stays a discreet pin (a city is a dot, not a continent) and grows only gently,
 * flattening out so a spike can't swamp the map.
 */
const MARKER_MIN = 0.022;
const MARKER_MAX = 0.045;

function markerSize(sessions: number): number {
  // Saturates around ~25 sessions; sqrt keeps early growth visible.
  const weight = Math.min(1, Math.sqrt(Math.max(0, sessions) / 25));
  return MARKER_MIN + weight * (MARKER_MAX - MARKER_MIN);
}

// Zoom bounds. 1 is the whole globe in frame; past ~4 the dot map turns coarse.
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.3;

const clampScale = (n: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));

export default function Globe({ points }: { points: GlobePoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read inside the render loop (which runs every frame) so new poll data
  // appears without tearing down and rebuilding the globe.
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Drag-to-spin state, kept in refs so it never triggers a React re-render.
  const phi = useRef(0);
  const width = useRef(0);
  const dragging = useRef<number | null>(null);

  // Zoom is held in a ref (read every frame by the render loop) and mirrored
  // into state purely so the +/- buttons can disable at the limits.
  const scale = useRef(1);
  const [zoom, setZoom] = useState(1);

  const zoomTo = (next: number) => {
    scale.current = clampScale(next);
    setZoom(scale.current);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onResize = () => {
      if (canvas) {
        width.current = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 600;
      }
    };
    onResize();

    const resizeObserver = new ResizeObserver(() => {
      onResize();
    });
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement);
    }
    window.addEventListener("resize", onResize);

    // Registered natively (not via React's onWheel) so it can be non-passive:
    // preventDefault stops the wheel from scrolling the page while zooming.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      scale.current = clampScale(scale.current * factor);
      setZoom(scale.current);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width.current * 2,
      height: width.current * 2,
      phi: 0,
      theta: 0.25,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [1, 1, 1],
      markerColor: GOLD_500,
      glowColor: [1, 1, 1],
      markers: [],
    });

    // cobe v2 runs no loop of its own — each `update()` paints one frame, so the
    // spin (and picking up freshly polled markers) is driven from here.
    let frame = requestAnimationFrame(function render() {
      const live = pointsRef.current;

      if (canvas.offsetWidth && width.current !== canvas.offsetWidth) {
        width.current = canvas.offsetWidth;
      }

      // Continuous auto-rotation when not dragging
      if (dragging.current === null) {
        phi.current += 0.004;
      }

      globe.update({
        phi: phi.current,
        scale: scale.current,
        width: width.current * 2,
        height: width.current * 2,
        markers: live.map((p) => ({
          location: [p.lat, p.lng] as [number, number],
          size: markerSize(p.sessions || 1),
          // Gold where someone is on the site right now; muted where they were
          // earlier in the window. Same split as the legend.
          color: p.live ? GOLD_500 : DORMANT,
        })),
      });

      canvas.style.opacity = "1";
      frame = requestAnimationFrame(render);
    });

    return () => {
      cancelAnimationFrame(frame);
      globe.destroy();
      resizeObserver.disconnect();
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = "grabbing";
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragging.current === null) return;
    const delta = e.clientX - dragging.current;
    phi.current += delta / 200;
    dragging.current = e.clientX;
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = null;
    e.currentTarget.style.cursor = "grab";
  };

  return (
    <div className="relative aspect-square h-full w-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="h-full w-full cursor-grab opacity-0 transition-opacity duration-700"
        style={{ contain: "layout paint size" }}
      />
      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border border-border bg-surface/90 backdrop-blur">
        {[
          {
            label: "Zoom in",
            glyph: "+",
            onClick: () => zoomTo(zoom * ZOOM_STEP),
            disabled: zoom >= MAX_SCALE,
          },
          {
            label: "Zoom out",
            glyph: "−",
            onClick: () => zoomTo(zoom / ZOOM_STEP),
            disabled: zoom <= MIN_SCALE,
          },
        ].map((b, i) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.label}
            onClick={b.onClick}
            disabled={b.disabled}
            className={`flex h-8 w-8 items-center justify-center text-base leading-none text-foreground transition-colors hover:bg-gold-50 hover:text-gold-600 disabled:opacity-30 disabled:hover:bg-transparent ${
              i === 0 ? "border-b border-border" : ""
            }`}
          >
            {b.glyph}
          </button>
        ))}
      </div>

      {zoom > MIN_SCALE && (
        <button
          type="button"
          onClick={() => zoomTo(MIN_SCALE)}
          className="absolute left-2 top-2 rounded-md border border-border bg-surface/90 px-2.5 py-1 text-[11px] uppercase tracking-widest text-muted backdrop-blur transition-colors hover:text-gold-600"
        >
          Reset
        </button>
      )}

      {points.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-xs text-muted">
          No located sessions yet
        </p>
      )}
    </div>
  );
}
