import { useRef, useState } from "react";

type Rect = { x: number; y: number; w: number; h: number };
type Corner = "nw" | "ne" | "sw" | "se";

export type CropResult = { file: File; dataUrl: string };

type DragState =
  | { mode: "new"; startX: number; startY: number }
  | { mode: "move"; startX: number; startY: number; orig: Rect }
  | { mode: "resize"; corner: Corner; startX: number; startY: number; orig: Rect };

const MIN_SIZE = 24;
const HANDLE_HIT = 28;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function nearCorner(r: Rect, x: number, y: number): Corner | null {
  const corners: [Corner, number, number][] = [
    ["nw", r.x, r.y],
    ["ne", r.x + r.w, r.y],
    ["sw", r.x, r.y + r.h],
    ["se", r.x + r.w, r.y + r.h],
  ];
  for (const [c, cx, cy] of corners) {
    if (Math.abs(x - cx) <= HANDLE_HIT && Math.abs(y - cy) <= HANDLE_HIT) return c;
  }
  return null;
}

export function ImageCropper({ src, onCancel, onConfirm }: { src: string; onCancel: () => void; onConfirm: (result: CropResult) => void }) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [displayed, setDisplayed] = useState<{ w: number; h: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);

  function onImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.clientWidth;
    const h = img.clientHeight;
    setDisplayed({ w, h });
    setRect({ x: w * 0.05, y: h * 0.05, w: w * 0.9, h: h * 0.9 });
  }

  function localPoint(e: React.PointerEvent) {
    const area = areaRef.current;
    if (!area) return { x: 0, y: 0 };
    const box = area.getBoundingClientRect();
    return {
      x: clamp(e.clientX - box.left, 0, box.width),
      y: clamp(e.clientY - box.top, 0, box.height),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!rect || !displayed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    const corner = nearCorner(rect, p.x, p.y);
    if (corner) {
      dragRef.current = { mode: "resize", corner, startX: p.x, startY: p.y, orig: rect };
    } else if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
      dragRef.current = { mode: "move", startX: p.x, startY: p.y, orig: rect };
    } else {
      dragRef.current = { mode: "new", startX: p.x, startY: p.y };
      setRect({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !displayed) return;
    const p = localPoint(e);
    if (d.mode === "new") {
      setRect({
        x: Math.min(d.startX, p.x),
        y: Math.min(d.startY, p.y),
        w: Math.abs(p.x - d.startX),
        h: Math.abs(p.y - d.startY),
      });
    } else if (d.mode === "move") {
      setRect({
        ...d.orig,
        x: clamp(d.orig.x + (p.x - d.startX), 0, displayed.w - d.orig.w),
        y: clamp(d.orig.y + (p.y - d.startY), 0, displayed.h - d.orig.h),
      });
    } else {
      const { corner, orig } = d;
      let left = orig.x;
      let top = orig.y;
      let right = orig.x + orig.w;
      let bottom = orig.y + orig.h;
      if (corner === "nw" || corner === "sw") left = p.x;
      else right = p.x;
      if (corner === "nw" || corner === "ne") top = p.y;
      else bottom = p.y;
      left = clamp(left, 0, right - MIN_SIZE);
      top = clamp(top, 0, bottom - MIN_SIZE);
      right = clamp(right, left + MIN_SIZE, displayed.w);
      bottom = clamp(bottom, top + MIN_SIZE, displayed.h);
      setRect({ x: left, y: top, w: right - left, h: bottom - top });
    }
  }

  function onPointerUp() {
    dragRef.current = null;
    if (!rect || !displayed) return;
    if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) {
      setRect({ x: displayed.w * 0.05, y: displayed.h * 0.05, w: displayed.w * 0.9, h: displayed.h * 0.9 });
    }
  }

  async function exportImage(crop: Rect | null) {
    const img = imgRef.current;
    if (!img || !displayed) return;
    setBusy(true);
    try {
      const scale = img.naturalWidth / displayed.w;
      let sx = 0;
      let sy = 0;
      let sw = img.naturalWidth;
      let sh = img.naturalHeight;
      if (crop) {
        sx = Math.round(crop.x * scale);
        sy = Math.round(crop.y * scale);
        sw = Math.max(1, Math.round(crop.w * scale));
        sh = Math.max(1, Math.round(crop.h * scale));
      }
      const MAX_DIM = 2400;
      const outScale = Math.min(1, MAX_DIM / Math.max(sw, sh));
      const outW = Math.max(1, Math.round(sw * outScale));
      const outH = Math.max(1, Math.round(sh * outScale));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob) return;
      onConfirm({
        file: new File([blob], `crop-${Date.now()}.jpg`, { type: "image/jpeg" }),
        dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      });
    } finally {
      setBusy(false);
    }
  }

  function rotate() {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    setRect(null);
    setDisplayed(null);
    img.src = canvas.toDataURL("image/jpeg", 0.92);
  }

  const handlePos: Record<Corner, string> = {
    nw: "-left-2 -top-2 cursor-nwse-resize",
    ne: "-right-2 -top-2 cursor-nesw-resize",
    sw: "-left-2 -bottom-2 cursor-nesw-resize",
    se: "-right-2 -bottom-2 cursor-nwse-resize",
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-foreground/80 backdrop-blur-sm" dir="rtl">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="text-lg font-semibold text-background">اقتصاص الصورة</h2>
        <button type="button" onClick={onCancel} className="rounded-full bg-background/15 px-4 py-2 text-sm text-background hover:bg-background/25">
          إلغاء
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-4">
        <div ref={areaRef} className="relative touch-none select-none" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <img ref={imgRef} src={src} alt="" onLoad={onImageLoad} className="max-h-[62vh] max-w-full rounded-xl" draggable={false} />
          {rect && displayed && (
            <div
              className="pointer-events-none absolute border-2 border-primary"
              style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, boxShadow: "0 0 0 9999px rgba(15,17,26,0.62)" }}
            >
              {(["nw", "ne", "sw", "se"] as Corner[]).map((c) => (
                <span
                  key={c}
                  className={`pointer-events-none absolute size-5 rounded-full border-2 border-primary bg-background ${handlePos[c]}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="px-6 pb-2 text-center text-xs text-background/75">اسحب لتحديد المساحة، أو اسحب زوايا الإطار لتعديلها. يبقى النص داخل الإطار فقط.</p>

      <div className="flex flex-wrap items-center justify-center gap-3 px-5 pb-6 pt-2">
        <button type="button" onClick={rotate} className="rounded-full border border-background/30 px-5 py-2.5 text-sm text-background hover:bg-background/10">
          ↻ تدوير
        </button>
        <button
          type="button"
          onClick={() => exportImage(null)}
          disabled={busy || !displayed}
          className="rounded-full border border-background/30 px-5 py-2.5 text-sm text-background hover:bg-background/10 disabled:opacity-60"
        >
          اعتماد الصورة كاملة
        </button>
        <button
          type="button"
          onClick={() => exportImage(rect)}
          disabled={busy || !rect || rect.w < MIN_SIZE}
          className="rounded-full bg-primary px-7 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "جارٍ القصّ…" : "قصّ واعتماد"}
        </button>
      </div>
    </div>
  );
}
