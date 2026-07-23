import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, ROOMS_BUCKET } from "@/lib/supabaseServer";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

// POST /api/projects/:id/photo — multipart form: edit_key, photo (File), photo_w, photo_h
// Replaces the project's photo. Regions are left untouched.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const form = await req.formData();
    const edit_key = form.get("edit_key") as string | null;
    const file = form.get("photo") as File | null;
    const w = parseInt((form.get("photo_w") as string) || "0", 10);
    const h = parseInt((form.get("photo_h") as string) || "0", 10);

    if (!edit_key) return NextResponse.json({ error: "Missing edit key" }, { status: 401 });
    if (!file) return NextResponse.json({ error: "No photo" }, { status: 400 });
    if (!w || !h) return NextResponse.json({ error: "Missing dimensions" }, { status: 400 });
    if (file.size > 8 * 1024 * 1024)
      return NextResponse.json({ error: "Photo too large (max 8MB)" }, { status: 400 });

    const db = supabaseAdmin();
    const { data: proj } = await db
      .from("projects")
      .select("edit_key, photo_path")
      .eq("id", params.id)
      .single();
    if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (proj.edit_key !== edit_key)
      return NextResponse.json({ error: "Wrong edit key" }, { status: 403 });

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const up = await db.storage
      .from(ROOMS_BUCKET)
      .upload(path, bytes, { contentType: file.type || "image/jpeg", upsert: false });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

    const { error } = await db
      .from("projects")
      .update({ photo_path: path, photo_w: w, photo_h: h })
      .eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (proj.photo_path) {
      try {
        await db.storage.from(ROOMS_BUCKET).remove([proj.photo_path]);
      } catch {
        // best-effort cleanup of the old photo; failure here shouldn't fail the request
      }
    }

    return NextResponse.json({ ok: true, photo_path: path, photo_w: w, photo_h: h });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
