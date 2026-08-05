import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

// GET /api/schemes/:id — a single saved scheme, regardless of its gallery
// visibility. Used by per-scheme share links: the id itself is the
// capability, same trust model as a project's share link.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("schemes")
    .select("id, project_id, author_name, colors, in_gallery, created_at")
    .eq("id", params.id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
