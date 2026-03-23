import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { UpdateOntologyEntry } from "@/lib/ontology";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data, error } = await supabase
    .from("ontology_entries")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body: UpdateOntologyEntry = await request.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.properties_schema !== undefined) updates.properties_schema = body.properties_schema;

  const { data, error } = await supabase
    .from("ontology_entries")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "An ontology entry with that name already exists in this category" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Check if the entry exists and get its details
  const { data: entry, error: fetchError } = await supabase
    .from("ontology_entries")
    .select("category, name")
    .eq("id", id)
    .single();

  if (fetchError || !entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check if any nodes or edges reference this ontology type
  if (entry.category === "node_type") {
    const { count } = await supabase
      .from("nodes")
      .select("id", { count: "exact", head: true })
      .eq("type", entry.name);

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${count} node(s) use type '${entry.name}'` },
        { status: 409 }
      );
    }
  } else if (entry.category === "edge_type") {
    const { count } = await supabase
      .from("edges")
      .select("id", { count: "exact", head: true })
      .eq("relationship", entry.name);

    if (count && count > 0) {
      return NextResponse.json(
        { error: `Cannot delete: ${count} edge(s) use relationship '${entry.name}'` },
        { status: 409 }
      );
    }
  }

  const { error: deleteError } = await supabase
    .from("ontology_entries")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
