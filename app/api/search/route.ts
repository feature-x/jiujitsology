import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { embedQuery } from "@/lib/embeddings";

const TOP_K = 10;

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { query } = body;

  if (!query || typeof query !== "string") {
    return NextResponse.json(
      { error: "Missing required field: query" },
      { status: 400 }
    );
  }

  // Embed the query
  const queryEmbedding = await embedQuery(query);

  // Vector similarity search against user's chunks
  // Uses pgvector cosine distance operator (<=>)
  const { data: results, error } = await supabase.rpc(
    "match_chunks",
    {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: TOP_K,
      filter_user_id: user.id,
    }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(results);
}
