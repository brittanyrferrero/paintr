import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// GET /api/schemes?project_id=...  — returns gallery schemes for a project
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "Missing project_id" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("schemes")
    .select("id, project_id, author_name, colors, in_gallery, created_at")
    .eq("project_id", projectId)
    .eq("in_gallery", true)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/schemes  — save a new color scheme
// body: { project_id, author_name, colors, in_gallery }
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const { project_id, author_name, colors, in_gallery } = b || {};
    if (!project_id || !Array.isArray(colors))
      return NextResponse.json({ error: "Bad payload" }, { status: 400 });

    const db = supabaseAdmin();
    // Verify project exists to avoid orphan rows.
    const { data: proj } = await db.from("projects").select("id").eq("id", project_id).single();
    if (!proj) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const name = (author_name || "Anonymous").toString().slice(0, 60);
    const { data, error } = await db
      .from("schemes")
      .insert({ project_id, author_name: name, colors, in_gallery: !!in_gallery })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
