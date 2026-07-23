"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import RoomCanvas from "@/components/RoomCanvas";
import { photoUrl } from "@/lib/supabaseClient";
import { PALETTE, emptySlots, renderScene } from "@/lib/paint";
import type { Project, Region, ColorSlot, Scheme, Pt } from "@/lib/types";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const editKey = search.get("key");

  const [project, setProject] = useState<Project | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [mode, setMode] = useState<"edit" | "paint">("paint");

  // region editor state
  const [regions, setRegions] = useState<Region[]>([]);
  const [draft, setDraft] = useState<Pt[]>([]);
  const [selEdit, setSelEdit] = useState(-1);
  const [regName, setRegName] = useState("");
  const [occNext, setOccNext] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [titleDraft, setTitleDraft] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const photoFileRef = useRef<HTMLInputElement>(null);

  // painter state
  const [slots, setSlots] = useState<ColorSlot[]>([]);
  const [selPaint, setSelPaint] = useState(-1);
  const [curColor, setCurColor] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState("");
  const [toGallery, setToGallery] = useState(false);

  // gallery
  const [gallery, setGallery] = useState<Scheme[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setProject(d);
        setRegions(d.regions || []);
        setSlots(emptySlots(d.regions || []));
        setTitleDraft(d.title || "");
        if (editKey) setMode("edit");
      })
      .catch((e) => setLoadErr(e.message));
  }, [id, editKey]);

  useEffect(() => {
    fetch(`/api/schemes?project_id=${id}`)
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setGallery(d))
      .catch(() => {});
  }, [id]);

  const src = project ? photoUrl(project.photo_path) : "";

  // ---- editor actions ----
  function finishShape() {
    if (draft.length < 3) return;
    const name = regName.trim() || (occNext ? `Cutout ${regions.length + 1}` : `Region ${regions.length + 1}`);
    const next = [...regions, { name, pts: draft, occ: occNext }];
    setRegions(next);
    setSlots((s) => [...s, { color: null, strength: s[0]?.strength ?? 0.8 }]);
    setDraft([]);
    setRegName("");
    setOccNext(false);
  }
  function move(i: number, dir: 1 | -1) {
    const j = i + dir;
    if (j < 0 || j >= regions.length) return;
    const next = [...regions];
    [next[i], next[j]] = [next[j], next[i]];
    const ns = [...slots];
    [ns[i], ns[j]] = [ns[j], ns[i]];
    setRegions(next);
    setSlots(ns);
    setSelEdit(j);
  }
  function toggleOcc(i: number) {
    const next = regions.map((r, k) => (k === i ? { ...r, occ: !r.occ } : r));
    setRegions(next);
    if (next[i].occ) setSlots((s) => s.map((sl, k) => (k === i ? { color: null, strength: sl.strength } : sl)));
  }
  function delRegion(i: number) {
    setRegions(regions.filter((_, k) => k !== i));
    setSlots(slots.filter((_, k) => k !== i));
    setSelEdit(-1);
  }
  async function saveRegions() {
    if (!editKey) return;
    setSaveState("saving");
    const r = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edit_key: editKey, regions, title: titleDraft }),
    });
    setSaveState(r.ok ? "saved" : "idle");
    if (r.ok) {
      setProject((p) => (p ? { ...p, title: titleDraft } : p));
      setTimeout(() => setSaveState("idle"), 1600);
    }
  }
  async function replacePhoto(file: File) {
    if (!editKey) return;
    setPhotoErr("");
    setPhotoBusy(true);
    try {
      const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
        const img = new Image();
        img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => rej(new Error("Could not read image"));
        img.src = URL.createObjectURL(file);
      });
      const fd = new FormData();
      fd.append("edit_key", editKey);
      fd.append("photo", file);
      fd.append("photo_w", String(dims.w));
      fd.append("photo_h", String(dims.h));
      const r = await fetch(`/api/projects/${id}/photo`, { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Upload failed");
      setProject((p) =>
        p ? { ...p, photo_path: data.photo_path, photo_w: data.photo_w, photo_h: data.photo_h } : p
      );
    } catch (e: any) {
      setPhotoErr(e.message || "Something went wrong");
    } finally {
      setPhotoBusy(false);
    }
  }

  // ---- painter actions ----
  function applyColor(color: string) {
    setCurColor(color);
    let target = selPaint;
    if (target < 0 || regions[target]?.occ) target = regions.findIndex((r) => !r.occ);
    if (target < 0) return;
    setSelPaint(target);
    setSlots((s) => s.map((sl, k) => (k === target ? { ...sl, color } : sl)));
  }
  function applyColorToAll(color: string) {
    setCurColor(color);
    setSlots((s) => s.map((sl, k) => (regions[k]?.occ ? sl : { ...sl, color })));
  }
  // Intensity is one shared setting across every region, not per-region — it
  // rides along in each slot's `strength` field so it saves with the scheme,
  // but every slot is always kept in sync with the same value.
  function setIntensity(v: number) {
    setSlots((s) => s.map((sl) => ({ ...sl, strength: v })));
  }
  async function saveScheme() {
    const r = await fetch("/api/schemes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: id,
        author_name: authorName || "Anonymous",
        colors: slots,
        in_gallery: toGallery,
      }),
    });
    if (r.ok && toGallery) {
      const d = await fetch(`/api/schemes?project_id=${id}`).then((x) => x.json());
      if (Array.isArray(d)) setGallery(d);
    }
    if (r.ok) alert(toGallery ? "Saved to the shared gallery." : "Scheme saved.");
  }

  if (loadErr) return <div className="wrap"><p className="err">Couldn&rsquo;t load this project: {loadErr}</p></div>;
  if (!project) return <div className="wrap"><p className="spin">Loading&hellip;</p></div>;

  const paintable = regions.filter((r) => !r.occ);

  return (
    <div className="wrap">
      <header className="top">
        <h1>{project.title}</h1>
        <span className="eyebrow">{editKey ? "creator view" : "try your colors"}</span>
      </header>

      {editKey && (
        <div className="modebar">
          <button className={mode === "edit" ? "on" : ""} onClick={() => setMode("edit")}>Define regions</button>
          <button className={mode === "paint" ? "on" : ""} onClick={() => setMode("paint")}>Try colors</button>
        </div>
      )}

      <div className="layout">
        <RoomCanvas
          photoSrc={src}
          regions={regions}
          slots={slots}
          mode={mode}
          draft={draft}
          selEdit={selEdit}
          onDraftChange={setDraft}
          onRegionsChange={setRegions}
          onSelectEdit={setSelEdit}
          selPaint={selPaint}
          onSelectPaint={(i) => setSelPaint(i)}
        />

        {mode === "edit" ? (
          <div className="panel">
            <h2>Room</h2>
            <input
              type="text"
              placeholder="Room name"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
            />
            <div className="row">
              <button
                className="act ghost"
                onClick={() => photoFileRef.current?.click()}
                disabled={photoBusy}
              >
                {photoBusy ? "Uploading…" : "Replace photo"}
              </button>
            </div>
            <input
              ref={photoFileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) replacePhoto(f);
                e.target.value = "";
              }}
            />
            {photoErr && <div className="err">{photoErr}</div>}
            <p className="hint" style={{ marginTop: 10 }}>
              Replacing the photo keeps your traced regions &mdash; only the picture underneath changes.
            </p>

            <h2 style={{ marginTop: 18 }}>Regions</h2>
            <p className="hint">
              Click around a surface to drop points; close by clicking the first point (or hit
              Finish). Select a region to drag its points; double-click a point to remove it. Use
              &#9650;/&#9660; to stack; mark lamps as keep-on-top cutouts.
            </p>
            <input type="text" placeholder="Region name" value={regName} onChange={(e) => setRegName(e.target.value)} />
            <label className="occrow">
              <input type="checkbox" checked={occNext} onChange={(e) => setOccNext(e.target.checked)} />
              Keep on top &mdash; don&rsquo;t paint (lamps, chain, fixtures)
            </label>
            <div className="row">
              <button className="act" disabled={draft.length < 3} onClick={finishShape}>Finish shape</button>
              <button className="act ghost" disabled={!draft.length} onClick={() => setDraft(draft.slice(0, -1))}>Undo point</button>
            </div>

            <ul className="chips" style={{ marginTop: 14 }}>
              {regions.map((_, disp) => {
                const i = regions.length - 1 - disp;
                const rg = regions[i];
                return (
                  <li key={i} className={"chip" + (i === selEdit ? " sel" : "")} onClick={() => setSelEdit(i)}>
                    <div className={"paint" + (rg.occ ? " cut" : "")} style={{ background: rg.occ ? undefined : slots[i]?.color || "#fff" }} />
                    <div className="meta">
                      <span className="nm">{rg.name} {rg.occ && <span className="pill">on top</span>}</span>
                      <span className="sub">{rg.pts.length} points</span>
                    </div>
                    <div className="ctrl" onClick={(e) => e.stopPropagation()}>
                      <button title="cutout toggle" onClick={() => toggleOcc(i)}>{rg.occ ? "●" : "○"}</button>
                      <button title="forward" disabled={i === regions.length - 1} onClick={() => move(i, 1)}>▲</button>
                      <button title="back" disabled={i === 0} onClick={() => move(i, -1)}>▼</button>
                      <button title="delete" onClick={() => delRegion(i)}>×</button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <button className="act" onClick={saveRegions} disabled={saveState === "saving"}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save changes"}
            </button>
            <p className="hint" style={{ marginTop: 10 }}>
              Saves the room name and regions, so everyone with the share link sees the same setup.
            </p>
          </div>
        ) : (
          <div className="panel">
            <h2>Pick a region</h2>
            <ul className="chips">
              {paintable.length === 0 && <li className="hint">No paintable regions yet.</li>}
              {regions.map((rg, i) =>
                rg.occ ? null : (
                  <li key={i} className={"chip" + (i === selPaint ? " sel" : "")} onClick={() => setSelPaint(i)}>
                    <div className="paint" style={{ background: slots[i]?.color || "#fff" }} />
                    <div className="meta"><span className="nm">{rg.name}</span></div>
                  </li>
                )
              )}
            </ul>

            <h2>Color</h2>
            <div className="colors">
              {PALETTE.map((hex) => (
                <div key={hex} className={"c" + (curColor === hex ? " on" : "")} style={{ background: hex }} onClick={() => applyColor(hex)} />
              ))}
            </div>
            <div className="pickrow">
              <input type="color" value={curColor || "#c9d4d0"} onChange={(e) => applyColor(e.target.value)} />
              <span className="slab">custom color</span>
            </div>
            <button className="act ghost mt" disabled={!curColor} onClick={() => curColor && applyColorToAll(curColor)}>
              Apply to all regions
            </button>
            <div className="slab mt">Intensity &middot; all regions</div>
            <input type="range" min={50} max={150} value={Math.round((slots[0]?.strength ?? 0.8) * 100)} onChange={(e) => setIntensity(Number(e.target.value) / 100)} />
            <div className="row mt">
              <button className="act ghost" onClick={() => selPaint >= 0 && setSlots((s) => s.map((sl, k) => (k === selPaint ? { ...sl, color: null } : sl)))}>Reset region</button>
              <button className="act ghost" onClick={() => setSlots((s) => s.map((sl) => ({ ...sl, color: null })))}>Reset all</button>
            </div>

            <h2 style={{ marginTop: 18 }}>Save your scheme</h2>
            <input type="text" placeholder="Your name (optional)" value={authorName} onChange={(e) => setAuthorName(e.target.value)} />
            <label className="occrow">
              <input type="checkbox" checked={toGallery} onChange={(e) => setToGallery(e.target.checked)} />
              Add to the shared gallery so others can see it
            </label>
            <button className="act" onClick={saveScheme}>Save scheme</button>
          </div>
        )}
      </div>

      {gallery.length > 0 && (
        <div style={{ marginTop: 34 }}>
          <h2 className="eyebrow" style={{ borderBottom: "2px solid var(--ink)", paddingBottom: 8 }}>
            Shared gallery · {gallery.length}
          </h2>
          <div className="gallery">
            {gallery.map((sc) => (
              <GalleryCard key={sc.id} src={src} regions={regions} scheme={sc} onUse={() => { setSlots(sc.colors); setMode("paint"); }} />
            ))}
          </div>
        </div>
      )}

      <div className="foot">
        <span className="tag">tip</span>
        Trace cutouts slightly larger than the fixture so the whole lamp stays protected. Overlap the
        column onto the wall edges so no sliver of wall color peeks along the seam.
      </div>
    </div>
  );
}

function GalleryCard({ src, regions, scheme, onUse }: { src: string; regions: Region[]; scheme: Scheme; onUse: () => void }) {
  const [url, setUrl] = useState<string>("");
  const key = useMemo(() => JSON.stringify(scheme.colors), [scheme.colors]);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight;
      const cv = document.createElement("canvas");
      const scale = 320 / W;
      cv.width = Math.round(W * scale);
      cv.height = Math.round(H * scale);
      const c = cv.getContext("2d")!;
      c.scale(scale, scale);
      renderScene(c, img, regions, scheme.colors, W, H);
      setUrl(cv.toDataURL("image/jpeg", 0.8));
    };
    img.src = src;
  }, [src, regions, key]);

  const when = new Date(scheme.created_at).toLocaleDateString();
  return (
    <div className="gcard" onClick={onUse} title="Load this scheme">
      {url ? <img src={url} alt="" /> : <div style={{ height: 120 }} />}
      <div className="cap">
        <span className="who">{scheme.author_name}</span>
        <span className="when">{when}</span>
      </div>
    </div>
  );
}
