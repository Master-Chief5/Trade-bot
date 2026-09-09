import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './Button';

/** Drawn at 3× the printed size so the signature stays crisp on paper. */
const W = 900;
const H = 240;

/**
 * A finger-or-mouse signature pad. Exports a trimmed PNG data URL, so a small
 * squiggle in the corner does not become a page-wide image on the sheet.
 */
export function SignaturePad({ onDone, onCancel, busy }: { onDone: (dataUrl: string) => void; onCancel: () => void; busy?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const ctx = () => canvasRef.current?.getContext('2d') ?? null;

  const reset = useCallback(() => {
    const c = ctx();
    if (!c || !canvasRef.current) return;
    c.clearRect(0, 0, W, H);
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#111111';
    setHasInk(false);
  }, []);

  useEffect(() => { reset(); }, [reset]);

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pointAt(e);
    // A tap with no drag should still leave a dot, so the stroke starts here.
    const c = ctx();
    const p = last.current;
    if (c && p) {
      c.beginPath();
      c.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      c.fillStyle = '#111111';
      c.fill();
    }
    setHasInk(true);
  };

  const moveTo = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const c = ctx();
    const from = last.current;
    const to = pointAt(e);
    if (!c || !from) return;
    c.beginPath();
    c.moveTo(from.x, from.y);
    c.lineTo(to.x, to.y);
    c.stroke();
    last.current = to;
  };

  const up = () => {
    drawing.current = false;
    last.current = null;
  };

  /** Crops to the ink, pads it, and returns a PNG on a white background. */
  const trimmed = (): string | null => {
    const src = canvasRef.current;
    const c = ctx();
    if (!src || !c) return null;
    const { data } = c.getImageData(0, 0, W, H);
    let minX = W, minY = H, maxX = -1, maxY = -1;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (data[(y * W + x) * 4 + 3] > 8) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null;
    const pad = 12;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    const oc = out.getContext('2d');
    if (!oc) return null;
    oc.fillStyle = '#ffffff';
    oc.fillRect(0, 0, out.width, out.height);
    oc.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  };

  return (
    <div className="stack">
      <div className="field">
        <span className="label">Sign here</span>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="sigpad"
          onPointerDown={down}
          onPointerMove={moveTo}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
        />
        <span className="help">Use a finger on a phone. This goes onto the printed sheet next to the day you are signing for.</span>
      </div>
      <div className="row">
        <Button variant="ghost" onClick={reset} disabled={!hasInk || busy}>Clear</Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button
          className="grow"
          disabled={!hasInk || busy}
          onClick={() => {
            const url = trimmed();
            if (url) onDone(url);
          }}
        >
          Sign
        </Button>
      </div>
    </div>
  );
}
