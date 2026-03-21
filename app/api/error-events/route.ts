import { NextRequest, NextResponse } from "next/server";
import { parseSentryEnvelope, type ErrorInfo } from "./parse";

/** Strip backtick sequences and newlines to prevent Markdown injection. */
function sanitize(text: string): string {
  return text.replace(/`{3,}/g, "```\u200B").replace(/[\r\n]+/g, " ");
}

/** Sanitize text for use inside a Markdown code fence. */
function sanitizeCodeBlock(text: string): string {
  return text.replace(/`{3,}/g, "```\u200B");
}

// In-memory rate limit: { errorMessage: timestampOfLastIssue }
const recentIssues = new Map<string, number>();
const RATE_LIMIT_MS = 3600 * 1000; // 1 hour

function isRateLimited(errorMessage: string): boolean {
  const lastCreated = recentIssues.get(errorMessage);
  if (lastCreated === undefined) return false;
  return Date.now() - lastCreated < RATE_LIMIT_MS;
}

function recordIssue(errorMessage: string): void {
  recentIssues.set(errorMessage, Date.now());
  // Evict stale entries
  const cutoff = Date.now() - RATE_LIMIT_MS;
  for (const [key, ts] of recentIssues) {
    if (ts < cutoff) recentIssues.delete(key);
  }
}

async function createGithubIssue(errorInfo: ErrorInfo): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token) {
    console.warn("GITHUB_TOKEN not set — cannot create issue from error event");
    return false;
  }
  if (!repo) {
    console.warn(
      "GITHUB_REPOSITORY not set — cannot create issue from error event",
    );
    return false;
  }

  const title = `bug: ${sanitize(errorInfo.type)}: ${sanitize(errorInfo.value).slice(0, 80)}`;
  const body = `## Auto-Detected Error

**Type:** \`${sanitize(errorInfo.type)}\`
**Message:** ${sanitize(errorInfo.value)}
**Environment:** ${sanitize(errorInfo.environment)}
**Timestamp:** ${sanitize(errorInfo.timestamp)}

### Stack Trace

\`\`\`
${sanitizeCodeBlock(errorInfo.stacktrace)}
\`\`\`

---
*Auto-created by the error receiver. Run \`/work-ticket\` to fix this bug.*
`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ title, body, labels: ["bug:auto"] }),
      },
    );

    if (response.status === 201) {
      const result = await response.json();
      console.log(
        `Created GitHub issue #${result.number} for ${errorInfo.type}`,
      );
      return true;
    }
    console.warn(`GitHub API returned status ${response.status}`);
    return false;
  } catch (err) {
    console.error("Failed to create GitHub issue:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const errorInfo = parseSentryEnvelope(body);

    if (!errorInfo) {
      return NextResponse.json({ id: "accepted" });
    }

    if (isRateLimited(errorInfo.value)) {
      console.log(
        `Rate-limited: ${errorInfo.type} (already reported within the last hour)`,
      );
      return NextResponse.json({ id: "rate_limited" });
    }

    if (await createGithubIssue(errorInfo)) {
      recordIssue(errorInfo.value);
    }
  } catch (err) {
    console.error("Error processing event:", err);
  }

  return NextResponse.json({ id: "accepted" });
}
