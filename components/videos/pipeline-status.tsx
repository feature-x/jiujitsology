"use client";

interface PipelineStatusProps {
  status: string;
  errorMessage?: string | null;
}

const statusConfig: Record<
  string,
  { label: string; className: string; icon: "dot" | "spinner" | "check" | "error" }
> = {
  uploaded: {
    label: "Uploaded",
    className: "text-muted-foreground",
    icon: "dot",
  },
  transcribing: {
    label: "Transcribing...",
    className: "text-yellow-600",
    icon: "spinner",
  },
  embedding: {
    label: "Embedding...",
    className: "text-blue-600",
    icon: "spinner",
  },
  extracting: {
    label: "Extracting knowledge...",
    className: "text-blue-600",
    icon: "spinner",
  },
  complete: {
    label: "Complete",
    className: "text-green-600",
    icon: "check",
  },
  error: {
    label: "Error",
    className: "text-destructive",
    icon: "error",
  },
};

function StatusIcon({ type }: { type: "dot" | "spinner" | "check" | "error" }) {
  switch (type) {
    case "dot":
      return (
        <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground" />
      );
    case "spinner":
      return (
        <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
      );
    case "check":
      return (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      );
    case "error":
      return (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      );
  }
}

export function PipelineStatus({ status, errorMessage }: PipelineStatusProps) {
  const config = statusConfig[status] ?? {
    label: status,
    className: "text-muted-foreground",
    icon: "dot" as const,
  };

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className={`flex items-center gap-1.5 ${config.className}`}>
        <StatusIcon type={config.icon} />
        <span className="text-xs font-medium">{config.label}</span>
      </div>
      {status === "error" && errorMessage && (
        <span className="text-xs text-destructive max-w-48 text-right truncate">
          {errorMessage}
        </span>
      )}
    </div>
  );
}

/** Whether a status is terminal (no more updates expected) */
export function isTerminalStatus(status: string): boolean {
  return status === "complete" || status === "error";
}
