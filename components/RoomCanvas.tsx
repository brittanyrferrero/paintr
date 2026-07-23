"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Region, ColorSlot, Pt } from "@/lib/types";
import { dist, pointInPoly, renderScene } from "@/lib/paint";

type Mode = "edit" | "paint";

interface Props {
  photoSrc: string;
  regions: Region[];
  slots: ColorSlot[];
  mode: Mode;
  // edit mode
  draft?: Pt[];
  selEdit?: number;
  onDraftChange?: (pts: Pt[]) => void;
  onRegionsChange?: (r: Region[]) => void;
  onSelectEdit?: (i: number) => void;
  // paint mode
  selPaint?: number;
  onSelectPaint?: (i: number) => void;
}

export default function RoomCanvas(props: Props) {
  const { photoSrc, regions, slots, mode } = props;
  const cvRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dimRef = useRef({ w: 0, h: 0 });
  const dragRef = useRef<{ kind: "draft" | "region"; ri?: number; pi: number } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const draw = useCallback(() => {
    const cv = cvRef.current, img = imgRef.current;
    if (!cv || !img) return;
    const c = cv.getContext("2d")!;
    const { w: W, h: H } = dimRef.current;
    const p = propsRef.current;

    renderScene(c, img, p.regions, p.slots, W, H);
    const IW = W;

    if (p.mode === "edit") {
      p.regions.forEach((rg, i) => {
        if (rg.pts.length < 3) return;
        c.beginPath();
        c.moveTo(rg.pts[0][0], rg.pts[0][1]);
        for (let k = 1; k < rg.pts.length; k++) c.lineTo(rg.pts[k][0], rg.pts[k][1]);
        c.closePath();
        c.lineWidth = Math.max(2, IW / 400);
        const sel = i === p.selEdit;
        if (rg.occ) {
          c.setLineDash([9, 6]);
          c.strokeStyle = sel ? "#e0b04a" : "#3a5a53";
          c.stroke();
          c.setLineDash([]);
          c.fillStyle = sel ? "rgba(58,90,83,.30)" : "rgba(58,90,83,.18)";
        } else {
          c.strokeStyle = sel ? "#b5502e" : "rgba(255,255,255,.85)";
          c.stroke();
          c.fillStyle = sel ? "rgba(181,80,46,.18)" : "rgba(255,255,255,.10)";
        }
        c.fill();
        if (sel) {
          rg.pts.forEach((pt, pi) => {
            const active =
              dragRef.current?.kind === "region" &&
              dragRef.current.ri === i &&
              dragRef.current.pi === pi;
            c.beginPath();
            c.arc(pt[0], pt[1], Math.max(5, IW / 150), 0, 7);
            c.fillStyle = active ? "#e0b04a" : rg.occ ? "#3a5a53" : "#b5502e";
            c.fill();
            c.strokeStyle = "#fff";
            c.lineWidth = 2;
            c.stroke();
          });
        }
      });
      const draft = p.draft || [];
      if (draft.length) {
        c.lineWidth = Math.max(2, IW / 400);
        c.strokeStyle = "#e0b04a";
        c.beginPath();
        c.moveTo(draft[0][0], draft[0][1]);
        for (let k = 1; k < draft.length; k++) c.lineTo(draft[k][0], draft[k][1]);
        c.stroke();
        draft.forEach((pt, k) => {
          c.beginPath();
          c.arc(pt[0], pt[1], Math.max(4, IW / 180), 0, 7);
          c.fillStyle = k === 0 ? "#b5502e" : "#e0b04a";
          c.fill();
          c.strokeStyle = "#fff";
          c.lineWidth = 2;
          c.stroke();
        });
      }
    } else {
      const sp = p.selPaint ?? -1;
      if (sp >= 0 && p.regions[sp] && p.regions[sp].pts.length > 2) {
        const rg = p.regions[sp];
        c.beginPath();
        c.moveTo(rg.pts[0][0], rg.pts[0][1]);
        for (let k = 1; k < rg.pts.length; k++) c.lineTo(rg.pts[k][0], rg.pts[k][1]);
        c.closePath();
        c.lineWidth = Math.max(2, IW / 300);
        c.strokeStyle = "#b5502e";
        c.setLineDash([8, 6]);
        c.stroke();
        c.setLineDash([]);
      }
    }
  }, []);

  // load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const cv = cvRef.current!;
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      dimRef.current = { w: img.naturalWidth, h: img.naturalHeight };
      draw();
    };
    img.src = photoSrc;
  }, [photoSrc, draw]);

  // redraw on any prop change
  useEffect(() => {
    draw();
  }, [regions, slots, mode, props.draft, props.selEdit, props.selPaint, draw]);

  const evtPt = (e: React.PointerEvent): Pt => {
    const cv = cvRef.current!;
    const r = cv.getBoundingClientRect();
    const { w: W, h: H } = dimRef.current;
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  const grab = () => Math.max(14, dimRef.current.w / 45);

  const findHandle = (pt: Pt) => {
    const p = propsRef.current;
    const draft = p.draft || [];
    for (let i = 0; i < draft.length; i++) if (dist(pt, draft[i]) < grab()) return { kind: "draft" as const, pi: i };
    const se = p.selEdit ?? -1;
    if (se >= 0 && p.regions[se]) {
      const pts = p.regions[se].pts;
      for (let i = 0; i < pts.length; i++) if (dist(pt, pts[i]) < grab()) return { kind: "region" as const, ri: se, pi: i };
    }
    for (let ri = p.regions.length - 1; ri >= 0; ri--) {
      const pts = p.regions[ri].pts;
      for (let i = 0; i < pts.length; i++) if (dist(pt, pts[i]) < grab()) return { kind: "region" as const, ri, pi: i };
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const p = propsRef.current;
    const pt = evtPt(e);
    if (p.mode === "edit") {
      const h = findHandle(pt);
      if (h) {
        dragRef.current = h;
        if (h.kind === "region" && h.ri !== undefined) p.onSelectEdit?.(h.ri);
        (e.target as Element).setPointerCapture?.(e.pointerId);
        draw();
        return;
      }
      const draft = p.draft || [];
      if (draft.length > 2 && dist(pt, draft[0]) < grab()) return; // finish handled by parent button
      p.onDraftChange?.([...draft, pt]);
    } else {
      for (let i = p.regions.length - 1; i >= 0; i--) {
        if (!p.regions[i].occ && p.regions[i].pts.length > 2 && pointInPoly(pt, p.regions[i].pts)) {
          p.onSelectPaint?.(i);
          return;
        }
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    const p = propsRef.current;
    const { w: W, h: H } = dimRef.current;
    const pt = evtPt(e);
    const x = Math.max(0, Math.min(W, pt[0]));
    const y = Math.max(0, Math.min(H, pt[1]));
    if (d.kind === "draft") {
      const draft = [...(p.draft || [])];
      draft[d.pi] = [x, y];
      p.onDraftChange?.(draft);
    } else if (d.ri !== undefined) {
      const next = p.regions.map((r) => ({ ...r, pts: r.pts.map((q) => [...q] as Pt) }));
      next[d.ri].pts[d.pi] = [x, y];
      p.onRegionsChange?.(next);
    }
  };

  const endDrag = () => {
    dragRef.current = null;
    draw();
  };

  const onDblClick = (e: React.MouseEvent) => {
    const p = propsRef.current;
    if (p.mode !== "edit") return;
    const cv = cvRef.current!;
    const r = cv.getBoundingClientRect();
    const { w: W, h: H } = dimRef.current;
    const pt: Pt = [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
    const se = p.selEdit ?? -1;
    if (se >= 0 && p.regions[se]) {
      const pts = p.regions[se].pts;
      for (let i = 0; i < pts.length; i++) {
        if (dist(pt, pts[i]) < grab() && pts.length > 3) {
          const next = p.regions.map((r2) => ({ ...r2, pts: [...r2.pts] }));
          next[se].pts.splice(i, 1);
          p.onRegionsChange?.(next);
          return;
        }
      }
    }
  };

  return (
    <div className="stage">
      <canvas
        ref={cvRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDblClick}
      />
    </div>
  );
}
