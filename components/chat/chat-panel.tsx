"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageBubble, type ChatCitation } from "@/components/chat/message-bubble";
import { VideoPlayer } from "@/components/video/video-player";

export function ChatPanel() {
  const chat = useChat();
  const [input, setInput] = useState("");
  const [citations, setCitations] = useState<ChatCitation[]>([]);
  const [playingVideo, setPlayingVideo] = useState<{
    id: string;
    title: string;
    startTime?: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageCountRef = useRef(0);
  const isLoading = chat.status === "streaming" || chat.status === "submitted";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages]);

  // Fetch citations when a new assistant message completes
  useEffect(() => {
    const messageCount = chat.messages.length;
    const lastMessage = chat.messages[messageCount - 1];

    if (
      messageCount > lastMessageCountRef.current &&
      lastMessage?.role === "assistant" &&
      !isLoading
    ) {
      fetch("/api/chat/citations")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.citations) {
            setCitations(data.citations);
          }
        })
        .catch(() => {});
    }

    lastMessageCountRef.current = messageCount;
  }, [chat.messages, isLoading]);

  function getMessageText(m: UIMessage): string {
    return (
      m.parts
        ?.filter(
          (p): p is Extract<typeof p, { type: "text" }> => p.type === "text"
        )
        .map((p) => p.text)
        .join("") || ""
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setCitations([]); // Clear citations for new query
    chat.sendMessage({ text: input });
    setInput("");
  }

  function handleCitationClick(citation: ChatCitation) {
    setPlayingVideo({
      id: citation.video_id,
      title: citation.video_title,
      startTime:
        citation.start_time != null && citation.start_time > 0
          ? citation.start_time
          : undefined,
    });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-2xl mx-auto pb-4">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
        {chat.messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">Ask about your BJJ library</p>
              <p className="text-sm mt-1">
                Try &quot;What techniques start from closed guard?&quot; or
                &quot;How do I set up the armbar?&quot;
              </p>
            </div>
          </div>
        )}
        {chat.messages.map((m, i) => {
          // Only attach citations to the last assistant message
          const isLastAssistant =
            m.role === "assistant" &&
            i === chat.messages.length - 1;

          return (
            <MessageBubble
              key={m.id}
              role={m.role as "user" | "assistant"}
              content={getMessageText(m)}
              citations={isLastAssistant ? citations : undefined}
              onCitationClick={isLastAssistant ? handleCitationClick : undefined}
            />
          );
        })}
        {isLoading &&
          chat.messages[chat.messages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2 text-sm text-muted-foreground">
                Thinking...
              </div>
            </div>
          )}
      </div>

      {/* Error display */}
      {chat.error && (
        <p className="text-sm text-destructive mb-2">
          Error: {chat.error.message}
        </p>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-2 border-t">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your BJJ instructionals..."
          disabled={isLoading}
          className="flex-1"
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </Button>
      </form>

      {/* Video player modal */}
      {playingVideo && (
        <VideoPlayer
          videoId={playingVideo.id}
          title={playingVideo.title}
          initialStartTime={playingVideo.startTime}
          onClose={() => setPlayingVideo(null)}
        />
      )}
    </div>
  );
}
