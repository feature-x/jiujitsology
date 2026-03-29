"use client";

import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export interface ChatCitation {
  index: number;
  video_id: string;
  video_title: string;
  start_time: number | null;
  citation: string;
}

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
  onCitationClick?: (citation: ChatCitation) => void;
}

function renderWithCitations(
  text: string,
  citations: ChatCitation[],
  onCitationClick: (citation: ChatCitation) => void
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\[(\d+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const citationIndex = parseInt(match[1], 10);
    const citation = citations.find((c) => c.index === citationIndex);

    if (citation) {
      parts.push(
        <button
          key={`cite-${match.index}`}
          className="inline-flex items-center text-primary hover:underline font-medium"
          onClick={() => onCitationClick(citation)}
          title={citation.citation}
        >
          [{citationIndex}]
        </button>
      );
    } else {
      parts.push(match[0]);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function CitationAwareMarkdown({
  content,
  citations,
  onCitationClick,
}: {
  content: string;
  citations: ChatCitation[];
  onCitationClick: (citation: ChatCitation) => void;
}) {
  const injectCitations = (children: React.ReactNode) => {
    if (Array.isArray(children)) {
      return children.map((child, i) =>
        typeof child === "string" ? (
          <Fragment key={i}>
            {renderWithCitations(child, citations, onCitationClick)}
          </Fragment>
        ) : (
          child
        )
      );
    }
    if (typeof children === "string") {
      return renderWithCitations(children, citations, onCitationClick);
    }
    return children;
  };

  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p>{injectCitations(children)}</p>,
        li: ({ children }) => <li>{injectCitations(children)}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function MessageBubble({
  role,
  content,
  citations,
  onCitationClick,
}: MessageBubbleProps) {
  const hasCitations =
    citations && citations.length > 0 && onCitationClick && role === "assistant";

  return (
    <div
      className={cn(
        "flex",
        role === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-2 text-sm",
          role === "user"
            ? "bg-primary text-primary-foreground whitespace-pre-wrap"
            : "bg-muted text-foreground"
        )}
      >
        {role === "assistant" ? (
          <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {hasCitations ? (
              <CitationAwareMarkdown
                content={content}
                citations={citations!}
                onCitationClick={onCitationClick!}
              />
            ) : (
              <ReactMarkdown>{content}</ReactMarkdown>
            )}
          </div>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
