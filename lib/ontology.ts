export interface OntologyEntry {
  id: string;
  category: "node_type" | "edge_type";
  name: string;
  description: string | null;
  properties_schema: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOntologyEntry {
  category: "node_type" | "edge_type";
  name: string;
  description?: string;
  properties_schema?: Record<string, unknown>;
}

export interface UpdateOntologyEntry {
  name?: string;
  description?: string;
  properties_schema?: Record<string, unknown>;
}
