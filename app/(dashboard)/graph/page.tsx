"use client";

import dynamic from "next/dynamic";

const GraphExplorer = dynamic(
  () =>
    import("@/components/graph/graph-explorer").then(
      (mod) => mod.GraphExplorer
    ),
  { ssr: false, loading: () => <p className="text-sm text-muted-foreground">Loading graph explorer...</p> }
);

export default function GraphPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight">Knowledge Graph</h1>
        <p className="text-muted-foreground mt-2">
          Explore techniques, positions, and their relationships.
        </p>
      </div>
      <GraphExplorer />
    </div>
  );
}
