"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageBubble } from "@/components/chat/message-bubble";

export function ChatPanel() {
  const chat = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = chat.status === "streaming" || chat.status === "submitted";

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chat.messages]);

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
    chat.sendMessage({ text: input });
    setInput("");
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
        {chat.messages.map((m) => (
          <MessageBubble
            key={m.id}
            role={m.role as "user" | "assistant"}
            content={getMessageText(m)}
          />
        ))}
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
    </div>
  );
}
