import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, ROOMS_BUCKET } from "@/lib/supabaseServer";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

// POST /api/projects  — multipart form: photo (File), title, photo_w, photo_h
// Returns { id, edit_key }.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("photo") as File | null;
    const title = (form.get("title") as string) || "Untitled room";
    const w = parseInt((form.get("photo_w") as string) || "0", 10);
    const h = parseInt((form.get("photo_h") as string) || "0", 10);

    if (!file) return NextResponse.json({ error: "No photo" }, { status: 400 });
    if (!w || !h) return NextResponse.json({ error: "Missing dimensions" }, { status: 400 });
    if (file.size > 8 * 1024 * 1024)
      return NextResponse.json({ error: "Photo too large (max 8MB)" }, { status: 400 });

    const db = supabaseAdmin();
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const up = await db.storage
      .from(ROOMS_BUCKET)
      .upload(path, bytes, { contentType: file.type || "image/jpeg", upsert: false });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

    const edit_key = randomBytes(16).toString("hex");
    const ins = await db
      .from("projects")
      .insert({ title, photo_path: path, photo_w: w, photo_h: h, regions: [], edit_key })
      .select("id")
      .single();
    if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });

    return NextResponse.json({ id: ins.data.id, edit_key });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
