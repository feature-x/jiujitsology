import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { CreateOntologyEntry } from "@/lib/ontology";

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  let query = supabase
    .from("ontology_entries")
    .select("*")
    .order("category")
    .order("name");

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: CreateOntologyEntry = await request.json();

  if (!body.category || !body.name) {
    return NextResponse.json(
      { error: "Missing required fields: category, name" },
      { status: 400 }
    );
  }

  if (body.category !== "node_type" && body.category !== "edge_type") {
    return NextResponse.json(
      { error: "category must be 'node_type' or 'edge_type'" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("ontology_entries")
    .insert({
      category: body.category,
      name: body.name,
      description: body.description || null,
      properties_schema: body.properties_schema || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Ontology entry '${body.name}' already exists in category '${body.category}'` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
