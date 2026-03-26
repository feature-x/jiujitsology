import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { buildSubgraph } from "@/lib/graph";

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

  // Load nodes (filtered by type if specified)
  let nodesQuery = supabase
    .from("nodes")
    .select("id, type, label, properties, source_video_id, videos(title, instructional)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (type) {
    nodesQuery = nodesQuery.eq("type", type);
  }

  const { data: nodes, error: nodesError } = await nodesQuery;

  if (nodesError) {
    return NextResponse.json({ error: nodesError.message }, { status: 500 });
  }

  if (!nodes || nodes.length === 0) {
    return NextResponse.json({ nodes: [], edges: [], total: 0 });
  }

  // Load edges where both endpoints are in the node set
  const nodeIds = nodes.map((n) => n.id);
  const { data: edges, error: edgesError } = await supabase
    .from("edges")
    .select("id, source_id, target_id, relationship, properties")
    .eq("user_id", user.id)
    .or(`source_id.in.(${nodeIds.join(",")}),target_id.in.(${nodeIds.join(",")})`);

  if (edgesError) {
    return NextResponse.json({ error: edgesError.message }, { status: 500 });
  }

  const { result } = buildSubgraph(
    nodes.map((n) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      properties: (n.properties as Record<string, unknown>) || {},
      source_video_id: n.source_video_id,
      source_video_title: (Array.isArray(n.videos) ? n.videos[0]?.title : (n.videos as { title: string; instructional: string } | null)?.title) || null,
      source_instructional: (Array.isArray(n.videos) ? n.videos[0]?.instructional : (n.videos as { title: string; instructional: string } | null)?.instructional) || null,
    })),
    (edges || []).map((e) => ({ ...e, properties: (e.properties as Record<string, unknown>) || {} }))
  );

  return NextResponse.json(result);
}
