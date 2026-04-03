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
import { VideoPlayer } from "@/components/video/video-player";

interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  source_video_id?: string | null;
  source_video_title?: string | null;
  source_instructional?: string | null;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  properties: Record<string, unknown>;
}

interface Segment {
  id: string;
  video_id: string;
  start_time: number | null;
  end_time: number | null;
  video_title: string | null;
  instructor: string | null;
  instructional: string | null;
}

interface SelectedNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  source_video_id: string | null;
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
  const [selectedInstructionals, setSelectedInstructionals] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [showMobileControls, setShowMobileControls] = useState(false);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [playingVideo, setPlayingVideo] = useState<{ id: string; title: string; label: string; startTime?: number } | null>(null);
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

  // Build instructional list from nodes within the instructor-filtered set
  const instructionals = (() => {
    if (selectedInstructors.size === 0) return [];
    const set = new Set<string>();
    for (const node of nodes) {
      if (node.source_instructional && (!instructorFilteredIds || instructorFilteredIds.has(node.id))) {
        set.add(node.source_instructional);
      }
    }
    return Array.from(set).sort();
  })();

  // Build Cytoscape elements from filtered data
  const filteredNodes = nodes.filter((n) => {
    if (!visibleTypes.has(n.type)) return false;
    if (instructorFilteredIds && !instructorFilteredIds.has(n.id)) return false;
    // Instructional filter: if instructionals are selected, only show nodes
    // from those instructionals (plus nodes without a source_instructional
    // that are connected via edges to matching nodes — handled by keeping
    // non-instructional nodes like Instructor, Position, Concept visible).
    if (selectedInstructionals.size > 0 && n.source_instructional && !selectedInstructionals.has(n.source_instructional)) return false;
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

  // Fetch related segments when a node is selected
  useEffect(() => {
    if (!selectedNode) {
      setSegments([]);
      return;
    }

    let cancelled = false;
    setSegmentsLoading(true);

    fetch(`/api/nodes/${selectedNode.id}/segments`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.segments) {
          setSegments(data.segments);
        }
        if (!cancelled) setSegmentsLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setSegments([]);
          setSegmentsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedNode?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleToggleInstructor(name: string) {
    setSelectedInstructors((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      // Clear instructional selection when instructors change —
      // the available instructionals depend on which instructors are selected.
      setSelectedInstructionals(new Set());
      return next;
    });
  }

  function handleToggleInstructional(name: string) {
    setSelectedInstructionals((prev) => {
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
      source_video_id: node.source_video_id || null,
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
    <div className="flex gap-4 h-[calc(100vh-10rem)] relative">
      {/* Mobile controls toggle */}
      <button
        className="md:hidden absolute top-2 left-2 z-10 bg-card border rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm"
        onClick={() => setShowMobileControls(!showMobileControls)}
      >
        {showMobileControls ? "Hide filters" : "Filters"}
      </button>

      {/* Sidebar — hidden on mobile, shown via toggle */}
      <div className={`${showMobileControls ? "absolute z-20 top-10 left-2 bg-card border rounded-lg shadow-lg max-h-[70vh]" : "hidden"} md:block w-56 shrink-0 overflow-y-auto`}>
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
          instructionals={instructionals}
          selectedInstructionals={selectedInstructionals}
          onToggleInstructional={handleToggleInstructional}
        />
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

      {/* Node detail panel — right column on desktop, bottom overlay on mobile */}
      {selectedNode && (
        <div className="fixed bottom-0 left-0 right-0 z-20 max-h-[50vh] md:static md:max-h-none md:z-auto w-full md:w-64 shrink-0 overflow-y-auto bg-background md:bg-transparent border-t md:border-t-0 shadow-lg md:shadow-none">
          <Card>
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
                  {selectedNode.source_video_id ? (
                    <button
                      className="text-xs text-primary hover:underline text-left"
                      onClick={() =>
                        setPlayingVideo({
                          id: selectedNode.source_video_id!,
                          title: selectedNode.source_video_title!,
                          label: selectedNode.label,
                        })
                      }
                    >
                      {selectedNode.source_video_title}
                    </button>
                  ) : (
                    <p className="text-xs">{selectedNode.source_video_title}</p>
                  )}
                </div>
              )}
              {!segmentsLoading && segments.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Related Segments ({segments.length})
                  </p>
                  {segments.map((seg) => (
                    <button
                      key={seg.id}
                      className="block text-xs text-primary hover:underline text-left mb-0.5"
                      onClick={() =>
                        setPlayingVideo({
                          id: seg.video_id,
                          title: seg.video_title || "Video",
                          label: selectedNode.label,
                          startTime: seg.start_time != null && seg.start_time > 0 ? seg.start_time : undefined,
                        })
                      }
                    >
                      {seg.instructor && (
                        <span className="text-muted-foreground">{seg.instructor} — </span>
                      )}
                      {seg.instructional || seg.video_title || "Video"}
                      {seg.start_time != null && seg.start_time > 0 && (
                        <span className="text-muted-foreground"> — {formatTime(seg.start_time)}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {segmentsLoading && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground">Loading segments...</p>
                </div>
              )}
              {!segmentsLoading && segments.length === 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground italic">
                    This concept was identified in the knowledge graph but
                    couldn&apos;t be linked to a specific video timestamp.
                  </p>
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
        </div>
      )}

      {playingVideo && (
        <VideoPlayer
          videoId={playingVideo.id}
          title={playingVideo.title}
          searchLabel={playingVideo.startTime == null ? playingVideo.label : undefined}
          initialStartTime={playingVideo.startTime}
          onClose={() => setPlayingVideo(null)}
        />
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
