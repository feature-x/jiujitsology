import { streamText, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { createServerClient } from "@/lib/supabase/server";
import { buildChatContext, buildSystemPrompt } from "@/lib/chat-context";
import { checkQuota, incrementChatQuery } from "@/lib/quota";

interface ClientMessage {
  role: string;
  content?: string;
  parts?: { type: string; text?: string }[];
}

/** Convert client messages (v5 or v6 format) to ModelMessage format */
function toModelMessages(messages: ClientMessage[]): ModelMessage[] {
  return messages.map((m) => {
    let content = "";
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.parts)) {
      content = m.parts
        .filter((p) => p.type === "text" && p.text)
        .map((p) => p.text!)
        .join(" ");
    }
    return { role: m.role as "user" | "assistant", content };
  });
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages } = await request.json();

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response("Missing messages", { status: 400 });
  }

  const coreMessages = toModelMessages(messages);

  // Check chat quota before processing
  const quota = await checkQuota(supabase, user.id, "chat");
  if (!quota.allowed) {
    return new Response(
      JSON.stringify({
        error: "Chat query limit reached",
        used: quota.used,
        limit: quota.limit,
        tier: quota.tier,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get the latest user message text for context retrieval
  const queryText =
    coreMessages
      .filter((m) => m.role === "user")
      .pop()
      ?.content?.toString() || "";

  // Build context from knowledge graph + embeddings
  const context = await buildChatContext(supabase, user.id, queryText);
  const systemPrompt = buildSystemPrompt(context);

  // Increment usage before streaming — counts the query even if the user
  // disconnects mid-stream (the LLM call is already being made).
  await incrementChatQuery(supabase, user.id);

  const result = streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages: coreMessages,
  });

  return result.toUIMessageStreamResponse();
}
