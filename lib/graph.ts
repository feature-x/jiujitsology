import Graph from "graphology";

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  source_video_id?: string | null;
  source_video_title?: string | null;
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship: string;
  properties: Record<string, unknown>;
}

export interface SubgraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total: number;
}

/**
 * Load nodes and their connecting edges into a graphology instance.
 * Returns both the graph and the serialized result for API responses.
 */
export function buildSubgraph(
  nodes: GraphNode[],
  allEdges: GraphEdge[]
): { graph: Graph; result: SubgraphResult } {
  const graph = new Graph();
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Add nodes
  for (const node of nodes) {
    graph.addNode(node.id, {
      type: node.type,
      label: node.label,
      properties: node.properties,
    });
  }

  // Add only edges where both endpoints are in the node set
  const includedEdges: GraphEdge[] = [];
  for (const edge of allEdges) {
    if (nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)) {
      try {
        graph.addEdge(edge.source_id, edge.target_id, {
          id: edge.id,
          relationship: edge.relationship,
          properties: edge.properties,
        });
        includedEdges.push(edge);
      } catch {
        // Skip duplicate edges (graphology throws on multi-edge in simple graph)
      }
    }
  }

  return {
    graph,
    result: {
      nodes,
      edges: includedEdges,
      total: nodes.length,
    },
  };
}

/**
 * Get the neighborhood of a node — all nodes directly connected to it
 * and their connecting edges.
 */
export function getNeighborhood(
  graph: Graph,
  nodeId: string,
  allNodes: GraphNode[],
  allEdges: GraphEdge[]
): SubgraphResult {
  if (!graph.hasNode(nodeId)) {
    return { nodes: [], edges: [], total: 0 };
  }

  const neighborIds = new Set(graph.neighbors(nodeId));
  neighborIds.add(nodeId); // Include the center node

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const neighborNodes = Array.from(neighborIds)
    .map((id) => nodeMap.get(id))
    .filter((n): n is GraphNode => n !== undefined);

  const neighborEdges = allEdges.filter(
    (e) => neighborIds.has(e.source_id) && neighborIds.has(e.target_id)
  );

  return {
    nodes: neighborNodes,
    edges: neighborEdges,
    total: neighborNodes.length,
  };
}
