"use client";

import { useState, useRef, useEffect } from "react";

interface MyRoom {
  id: string;
  edit_key: string;
  title: string;
  created_at: string;
}

const MINE_KEY = "roompaint_my_rooms";

function loadMine(): MyRoom[] {
  try {
    const raw = window.localStorage.getItem(MINE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMine(rooms: MyRoom[]) {
  window.localStorage.setItem(MINE_KEY, JSON.stringify(rooms));
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [hot, setHot] = useState(false);
  const [result, setResult] = useState<{ id: string; edit_key: string } | null>(null);
  const [mine, setMine] = useState<MyRoom[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMine(loadMine());
  }, []);

  function forgetRoom(id: string) {
    setMine((m) => {
      const next = m.filter((r) => r.id !== id);
      saveMine(next);
      return next;
    });
  }

  async function handleFile(file: File) {
    setErr("");
    if (!file.type.startsWith("image/")) {
      setErr("Please choose an image file.");
      return;
    }
    setBusy(true);
    try {
      const dims = await new Promise<{ w: number; h: number }>((res, rej) => {
        const img = new Image();
        img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => rej(new Error("Could not read image"));
        img.src = URL.createObjectURL(file);
      });
      const fd = new FormData();
      fd.append("photo", file);
      fd.append("title", title || "Untitled room");
      fd.append("photo_w", String(dims.w));
      fd.append("photo_h", String(dims.h));
      const r = await fetch("/api/projects", { method: "POST", body: fd });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Upload failed");
      setResult(data);
      setMine((m) => {
        const next = [
          { id: data.id, edit_key: data.edit_key, title: title.trim() || "Untitled room", created_at: new Date().toISOString() },
          ...m,
        ];
        saveMine(next);
        return next;
      });
    } catch (e: any) {
      setErr(e.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const editLink = result ? `${origin}/p/${result.id}?key=${result.edit_key}` : "";
  const shareLink = result ? `${origin}/p/${result.id}` : "";

  return (
    <div className="wrap">
      <header className="top">
        <h1>Room Painter</h1>
        <span className="eyebrow">upload &middot; mask &middot; recolor together</span>
      </header>

      {mine.length > 0 && (
        <div className="center" style={{ margin: "0 auto 32px" }}>
          <h2 className="eyebrow" style={{ borderBottom: "2px solid var(--ink)", paddingBottom: 8, marginBottom: 10 }}>
            Your rooms &middot; on this browser
          </h2>
          <ul className="chips">
            {mine.map((m) => (
              <li key={m.id} className="chip" onClick={() => (window.location.href = `/p/${m.id}?key=${m.edit_key}`)}>
                <div className="meta">
                  <span className="nm">{m.title}</span>
                  <span className="sub">{new Date(m.created_at).toLocaleDateString()}</span>
                </div>
                <div className="ctrl" onClick={(e) => e.stopPropagation()}>
                  <button title="remove from this list" onClick={() => forgetRoom(m.id)}>×</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!result ? (
        <div className="center">
          <p className="hint">
            Upload a photo of a room. You&rsquo;ll trace the walls, ceiling, and columns once, then
            share a link so anyone can try their own color combinations &mdash; no account needed.
          </p>
          <input
            type="text"
            placeholder="Project name (e.g. Front room repaint)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div
            className={"drop" + (hot ? " hot" : "")}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setHot(true);
            }}
            onDragLeave={() => setHot(false)}
            onDrop={(e) => {
              e.preventDefault();
              setHot(false);
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            {busy ? (
              <span className="spin">Uploading&hellip;</span>
            ) : (
              <span className="slab">Drop a photo here, or click to choose one</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          {err && <div className="err">{err}</div>}
        </div>
      ) : (
        <div className="center">
          <h2>Project created</h2>
          <p className="hint">
            Keep the <b>edit link</b> for yourself &mdash; it lets you define and change regions.
            Send the <b>share link</b> to friends so they can try colors.
          </p>
          <div className="banner" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div>
              <div className="eyebrow">Edit link (private)</div>
              <div className="mono">{editLink}</div>
            </div>
          </div>
          <div className="banner" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div>
              <div className="eyebrow">Share link</div>
              <div className="mono">{shareLink}</div>
            </div>
          </div>
          <div className="row mt">
            <button className="act" onClick={() => (window.location.href = editLink)}>
              Start tracing regions
            </button>
            <button
              className="act ghost"
              onClick={() => navigator.clipboard?.writeText(shareLink)}
            >
              Copy share link
            </button>
          </div>
        </div>
      )}

      <div className="foot">
        <span className="tag">how it works</span>
        Colors are multiplied over the original photo, so shadows and texture show through &mdash; it
        reads like paint, not a flat fill. Trace each surface once; mark lamps or fixtures as
        keep-on-top cutouts so they stay above every color.
      </div>
    </div>
  );
}
