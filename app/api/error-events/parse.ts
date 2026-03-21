interface SentryFrame {
  filename?: string;
  lineno?: number;
  function?: string;
  context_line?: string;
}

interface SentryException {
  type?: string;
  value?: string;
  stacktrace?: { frames?: SentryFrame[] } | null;
}

export interface ErrorInfo {
  type: string;
  value: string;
  stacktrace: string;
  timestamp: string;
  environment: string;
  serverName: string;
}

function formatStacktrace(
  stacktrace: { frames?: SentryFrame[] } | null | undefined,
): string {
  if (!stacktrace) return "No stacktrace available";
  const frames = stacktrace.frames ?? [];
  if (frames.length === 0) return "No stacktrace available";
  const lines: string[] = [];
  for (const frame of frames.slice(-10)) {
    const filename = frame.filename ?? "?";
    const lineno = frame.lineno ?? "?";
    const fn = frame.function ?? "?";
    lines.push(`  File "${filename}", line ${lineno}, in ${fn}`);
    if (frame.context_line) {
      lines.push(`    ${frame.context_line.trim()}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "No stacktrace available";
}

function formatTimestamp(ts: unknown): string {
  if (!ts) return "";
  const num = Number(ts);
  if (!isNaN(num)) {
    // Sentry sends Unix seconds (e.g. 1773831433.554)
    return new Date(num * 1000).toISOString();
  }
  // Already a string date
  return String(ts);
}

export function parseSentryEnvelope(body: string): ErrorInfo | null {
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const data = JSON.parse(trimmed);
      if (data.exception) {
        const values: SentryException[] = data.exception.values ?? [];
        if (values.length > 0) {
          const exc = values[values.length - 1];
          return {
            type: exc.type ?? "UnknownError",
            value: exc.value ?? "No message",
            stacktrace: formatStacktrace(exc.stacktrace),
            timestamp: formatTimestamp(data.timestamp),
            environment: String(data.environment ?? "unknown"),
            serverName: String(data.server_name ?? ""),
          };
        }
      }
    } catch {
      // Not valid JSON — skip this line
    }
  }
  return null;
}
