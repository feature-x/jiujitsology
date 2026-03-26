"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import CytoscapeComponent from "react-cytoscapejs";
import type cytoscape from "cytoscape";
import type { EventObject } from "cytoscape";
import { cytoscapeStylesheet, getNodeColor } from "@/lib/graph-styles";
import { GraphControls } from "@/components/graph/graph-controls";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  source_video_id?: string | null;
  source_video_title?: string | null;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  properties: Record<string, unknown>;
}

interface SelectedNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  source_video_title: string | null;
  edges: { relationship: string; target: string; direction: "out" | "in" }[];
}

export function GraphExplorer() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState("cose");
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(new Set());
  const [selectedInstructors, setSelectedInstructors] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const fetchGraph = useCallback(async () => {
    const response = await fetch("/api/graph?limit=200");
    if (response.ok) {
      const data = await response.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);

      // Initialize visible types from loaded data
      const types = new Set<string>(
        (data.nodes || []).map((n: GraphNode) => n.type)
      );
      setVisibleTypes(types);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Get instructor nodes for the dropdown
  const instructors = nodes
    .filter((n) => n.type === "Instructor")
    .map((n) => n.label)
    .sort();

  // Build the set of node IDs connected to selected instructors
  const instructorFilteredIds = (() => {
    if (selectedInstructors.size === 0) return null; // empty = show all

    const allConnected = new Set<string>();

    for (const instructorName of selectedInstructors) {
      const instructorNode = nodes.find(
        (n) => n.type === "Instructor" && n.label === instructorName
      );
      if (!instructorNode) continue;

      // Depth 1: direct connections
      const connectedIds = new Set<string>([instructorNode.id]);
      for (const edge of edges) {
        if (edge.source_id === instructorNode.id) connectedIds.add(edge.target_id);
        if (edge.target_id === instructorNode.id) connectedIds.add(edge.source_id);
      }

      // Depth 2: connections of connections, but do not traverse
      // through unselected Instructor nodes to prevent leaking their
      // entire subgraph into the filter results.
      const selectedInstructorIds = new Set(
        nodes
          .filter((n) => n.type === "Instructor" && selectedInstructors.has(n.label))
          .map((n) => n.id)
      );
      for (const edge of edges) {
        if (connectedIds.has(edge.source_id)) {
          const target = nodes.find((n) => n.id === edge.target_id);
          if (target?.type === "Instructor" && !selectedInstructorIds.has(target.id)) continue;
          connectedIds.add(edge.target_id);
        }
        if (connectedIds.has(edge.target_id)) {
          const source = nodes.find((n) => n.id === edge.source_id);
          if (source?.type === "Instructor" && !selectedInstructorIds.has(source.id)) continue;
          connectedIds.add(edge.source_id);
        }
      }

      for (const id of connectedIds) allConnected.add(id);
    }

    return allConnected;
  })();

  // Build Cytoscape elements from filtered data
  const filteredNodes = nodes.filter((n) => {
    if (!visibleTypes.has(n.type)) return false;
    if (instructorFilteredIds && !instructorFilteredIds.has(n.id)) return false;
    return true;
  });
  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => filteredNodeIds.has(e.source_id) && filteredNodeIds.has(e.target_id)
  );

  const elements = [
    ...filteredNodes.map((n) => ({
      data: {
        id: n.id,
        label: n.label,
        type: n.type,
        color: getNodeColor(n.type),
        properties: n.properties,
      },
    })),
    ...filteredEdges.map((e) => ({
      data: {
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        label: e.relationship,
        properties: e.properties,
      },
    })),
  ];

  const nodeTypes = Array.from(new Set(nodes.map((n) => n.type))).sort();

  // Re-run layout when filters change
  useEffect(() => {
    if (cyRef.current && !loading) {
      cyRef.current.layout({ name: layout }).run();
    }
  }, [filteredNodes.length, filteredEdges.length, layout, loading]);

  function handleToggleInstructor(name: string) {
    setSelectedInstructors((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function handleToggleType(type: string) {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function handleLayoutChange(newLayout: string) {
    setLayout(newLayout);
    if (cyRef.current) {
      cyRef.current
        .layout({ name: newLayout })
        .run();
    }
  }

  function handleFitView() {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 50);
    }
  }

  function handleNodeSelect(nodeId: string) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const nodeEdges = edges
      .filter((e) => e.source_id === nodeId || e.target_id === nodeId)
      .map((e) => {
        const isSource = e.source_id === nodeId;
        const otherNodeId = isSource ? e.target_id : e.source_id;
        const otherNode = nodes.find((n) => n.id === otherNodeId);
        return {
          relationship: e.relationship,
          target: otherNode?.label || "Unknown",
          direction: (isSource ? "out" : "in") as "out" | "in",
        };
      });

    setSelectedNode({
      id: node.id,
      type: node.type,
      label: node.label,
      properties: node.properties,
      source_video_title: node.source_video_title || null,
      edges: nodeEdges,
    });
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading graph...</p>
    );
  }

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No graph data yet. Upload and ingest a video to populate the knowledge
        graph.
      </p>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-10rem)]">
      {/* Sidebar */}
      <div className="w-56 shrink-0 overflow-y-auto">
        <GraphControls
          nodeTypes={nodeTypes}
          visibleTypes={visibleTypes}
          onToggleType={handleToggleType}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          onFitView={handleFitView}
          nodeCount={filteredNodes.length}
          edgeCount={filteredEdges.length}
          instructors={instructors}
          selectedInstructors={selectedInstructors}
          onToggleInstructor={handleToggleInstructor}
        />

        {selectedNode && (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardDescription>{selectedNode.type}</CardDescription>
              <CardTitle className="text-base">{selectedNode.label}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedNode.source_video_title && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Source
                  </p>
                  <p className="text-xs">{selectedNode.source_video_title}</p>
                </div>
              )}
              {Object.keys(selectedNode.properties).length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Properties
                  </p>
                  {Object.entries(selectedNode.properties).map(([k, v]) => (
                    <p key={k} className="text-xs">
                      <span className="text-muted-foreground">{k}:</span>{" "}
                      {String(v)}
                    </p>
                  ))}
                </div>
              )}
              {selectedNode.edges.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Connections ({selectedNode.edges.length})
                  </p>
                  {selectedNode.edges.map((e, i) => (
                    <p key={i} className="text-xs">
                      {e.direction === "out" ? "→" : "←"}{" "}
                      <span className="text-muted-foreground">
                        {e.relationship}
                      </span>{" "}
                      {e.target}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Graph canvas */}
      <div className="flex-1 border rounded-lg overflow-hidden bg-white">
        <CytoscapeComponent
          elements={elements}
          stylesheet={cytoscapeStylesheet}
          layout={{ name: layout }}
          style={{ width: "100%", height: "100%" }}
          cy={(cy: cytoscape.Core) => {
            cyRef.current = cy;
            cy.on("tap", "node", (evt: EventObject) => {
              handleNodeSelect(evt.target.id());
            });
            cy.on("tap", (evt: EventObject) => {
              if (evt.target === cy) {
                setSelectedNode(null);
              }
            });
          }}
        />
      </div>
    </div>
  );
}
