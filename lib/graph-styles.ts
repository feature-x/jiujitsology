import type { StylesheetCSS } from "cytoscape";

/** Color map for node types */
export const nodeTypeColors: Record<string, string> = {
  Technique: "#3b82f6", // blue
  Position: "#22c55e", // green
  Concept: "#a855f7", // purple
  Submission: "#ef4444", // red
  Sweep: "#f59e0b", // amber
  Guard: "#06b6d4", // cyan
  Pass: "#f97316", // orange
  Pin: "#ec4899", // pink
  Takedown: "#14b8a6", // teal
  Instructor: "#6b7280", // gray
  Instructional: "#78716c", // stone
};

export const defaultColor = "#94a3b8"; // slate

export function getNodeColor(type: string): string {
  return nodeTypeColors[type] || defaultColor;
}

export const cytoscapeStylesheet: StylesheetCSS[] = [
  {
    selector: "node",
    css: {
      label: "data(label)",
      "background-color": "data(color)",
      "text-valign": "bottom",
      "text-halign": "center",
      "font-size": "10px",
      color: "#374151",
      "text-margin-y": 4,
      width: 30,
      height: 30,
      "border-width": 2,
      "border-color": "#e5e7eb",
    },
  },
  {
    selector: "node:selected",
    css: {
      "border-width": 3,
      "border-color": "#1d4ed8",
      "background-color": "#2563eb",
    },
  },
  {
    selector: "edge",
    css: {
      width: 1.5,
      "line-color": "#d1d5db",
      "target-arrow-color": "#d1d5db",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      "font-size": "8px",
      color: "#9ca3af",
      "text-rotation": "autorotate",
      "text-margin-y": -8,
    },
  },
  {
    selector: "edge:selected",
    css: {
      width: 2.5,
      "line-color": "#3b82f6",
      "target-arrow-color": "#3b82f6",
    },
  },
];
