import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// GET /api/projects/:id  — public project data (never returns edit_key)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("projects")
    .select("id, title, photo_path, photo_w, photo_h, regions, created_at")
    .eq("id", params.id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/projects/:id  — update regions/title. Requires matching edit_key.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { edit_key, regions, title } = body || {};
    if (!edit_key) return NextResponse.json({ error: "Missing edit key" }, { status: 401 });

    const db = supabaseAdmin();
    const { data: proj } = await db
      .from("projects")
      .select("edit_key")
      .eq("id", params.id)
      .single();
    if (!proj) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (proj.edit_key !== edit_key)
      return NextResponse.json({ error: "Wrong edit key" }, { status: 403 });

    const patch: Record<string, unknown> = {};
    if (Array.isArray(regions)) patch.regions = regions;
    if (typeof title === "string") patch.title = title;
    if (Object.keys(patch).length === 0)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const { error } = await db.from("projects").update(patch).eq("id", params.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
