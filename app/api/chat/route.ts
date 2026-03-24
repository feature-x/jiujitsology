import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createServerClient } from "@/lib/supabase/server";
import { buildChatContext, buildSystemPrompt } from "@/lib/chat-context";

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

  // Get the latest user message text for context retrieval
  const lastUserMessage = messages
    .filter((m: { role: string }) => m.role === "user")
    .pop();

  // Extract text from message (handles both v5 content string and v6 parts array)
  let queryText = "";
  if (lastUserMessage) {
    if (typeof lastUserMessage.content === "string") {
      queryText = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.parts)) {
      queryText = lastUserMessage.parts
        .filter((p: { type: string }) => p.type === "text")
        .map((p: { text: string }) => p.text)
        .join(" ");
    }
  }

  // Build context from knowledge graph + embeddings
  const context = await buildChatContext(
    supabase,
    user.id,
    queryText
  );

  const systemPrompt = buildSystemPrompt(context);

  const result = streamText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages,
  });

  return result.toUIMessageStreamResponse();
}
