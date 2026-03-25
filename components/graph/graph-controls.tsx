"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { nodeTypeColors } from "@/lib/graph-styles";

interface GraphControlsProps {
  nodeTypes: string[];
  visibleTypes: Set<string>;
  onToggleType: (type: string) => void;
  layout: string;
  onLayoutChange: (layout: string) => void;
  onFitView: () => void;
  nodeCount: number;
  edgeCount: number;
  instructors: string[];
  selectedInstructors: Set<string>;
  onToggleInstructor: (name: string) => void;
}

const layouts = [
  { value: "cose", label: "Force-directed" },
  { value: "breadthfirst", label: "Hierarchy" },
  { value: "circle", label: "Circle" },
  { value: "grid", label: "Grid" },
];

export function GraphControls({
  nodeTypes,
  visibleTypes,
  onToggleType,
  layout,
  onLayoutChange,
  onFitView,
  nodeCount,
  edgeCount,
  instructors,
  selectedInstructors,
  onToggleInstructor,
}: GraphControlsProps) {
  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg bg-card">
      <div>
        <Label className="text-xs text-muted-foreground">
          {nodeCount} nodes, {edgeCount} edges
        </Label>
      </div>

      {instructors.length > 0 && (
        <div>
          <Label className="text-xs font-medium mb-2 block">
            Instructors{" "}
            {selectedInstructors.size > 0 && (
              <span className="text-muted-foreground font-normal">
                ({selectedInstructors.size} selected)
              </span>
            )}
          </Label>
          <div className="flex flex-col gap-1">
            {instructors.map((name) => (
              <button
                key={name}
                className="flex items-center gap-2 text-xs hover:bg-accent rounded px-1 py-0.5"
                onClick={() => onToggleInstructor(name)}
              >
                <span
                  className="w-3 h-3 rounded-sm border shrink-0 flex items-center justify-center"
                  style={{
                    backgroundColor: selectedInstructors.has(name)
                      ? "#6b7280"
                      : "transparent",
                    borderColor: "#6b7280",
                  }}
                >
                  {selectedInstructors.has(name) && (
                    <svg
                      className="w-2 h-2 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
                <span
                  className={
                    selectedInstructors.size === 0 || selectedInstructors.has(name)
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <Label className="text-xs font-medium mb-2 block">Layout</Label>
        <div className="flex flex-wrap gap-1">
          {layouts.map((l) => (
            <Button
              key={l.value}
              variant={layout === l.value ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => onLayoutChange(l.value)}
            >
              {l.label}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium mb-2 block">Node Types</Label>
        <div className="flex flex-col gap-1">
          {nodeTypes.map((type) => (
            <button
              key={type}
              className="flex items-center gap-2 text-xs hover:bg-accent rounded px-1 py-0.5"
              onClick={() => onToggleType(type)}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{
                  backgroundColor: nodeTypeColors[type] || "#94a3b8",
                  opacity: visibleTypes.has(type) ? 1 : 0.2,
                }}
              />
              <span
                className={
                  visibleTypes.has(type)
                    ? "text-foreground"
                    : "text-muted-foreground line-through"
                }
              >
                {type}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onFitView}>
        Fit to view
      </Button>
    </div>
  );
}
