import type { OntologyEntry } from "@/lib/ontology";
import type { VideoMetadata } from "@/lib/extraction";

export function buildExtractionPrompt(
  ontologyEntries: OntologyEntry[],
  transcriptionText: string,
  metadata?: VideoMetadata
): string {
  const nodeTypes = ontologyEntries
    .filter((e) => e.category === "node_type")
    .map((e) => {
      const schema = e.properties_schema
        ? ` | Properties: ${JSON.stringify(e.properties_schema)}`
        : "";
      return `- ${e.name}: ${e.description || "No description"}${schema}`;
    })
    .join("\n");

  const edgeTypes = ontologyEntries
    .filter((e) => e.category === "edge_type")
    .map((e) => `- ${e.name}: ${e.description || "No description"}`)
    .join("\n");

  return `You are a Brazilian Jiu-Jitsu knowledge extraction expert. Your task is to extract structured knowledge from BJJ instructional video transcriptions.

## Ontology

### Valid Node Types (with property schemas)
${nodeTypes}

### Valid Edge Types
${edgeTypes}

## Rules

1. Only use node types and edge types from the ontology above. Do not invent new types.
2. **Choose the most specific node type.** Use these guidelines:
   - If something is a guard variant (closed guard, half guard, butterfly guard, K-guard, de la Riva, etc.), use "Guard" not "Technique".
   - If something is a submission (armbar, kimura, triangle, heel hook, etc.), use "Submission" not "Technique".
   - If something is a sweep (scissor sweep, hip bump, etc.), use "Sweep" not "Technique".
   - If something is a guard pass (knee cut, torreando, leg drag, etc.), use "Pass" not "Technique".
   - If something is a pin (kesa gatame, north-south, etc.), use "Pin" not "Technique" or "Position".
   - If something is a takedown (single leg, double leg, osoto gari, etc.), use "Takedown" not "Technique".
   - If something is a control position (mount, side control, back control, etc.), use "Position".
   - Use "Technique" only for moves that don't fit a more specific type.
   - Use "Concept" for principles, strategies, and abstract ideas (e.g., "posture breaking", "inside position", "connection").
3. Use concise, canonical labels for nodes (e.g., "Armbar" not "The armbar from closed guard").
4. If the same technique/position is mentioned multiple times, use the same label consistently.
5. Extract relationships between techniques — how they connect, transition, counter, or chain together.
6. Include the instructor name if mentioned. Use type "Instructor".
7. Include the instructional title if mentioned. Use type "Instructional".
8. **Populate properties** based on the property schema for each node type. For example:
   - For a Guard node, set "open_closed" to "open" or "closed" if stated.
   - For a Technique/Submission/Sweep/Pass, set "gi_nogi" to "gi", "nogi", or "both" if stated.
   - For a Technique, set "belt_level" if the instructor mentions it (e.g., "fundamental", "advanced").
   - Return properties as a JSON string: e.g., {"gi_nogi": "both"} or {} if no properties apply.
9. Be thorough — extract all techniques, positions, and concepts discussed, not just the main ones.
${metadata?.instructor || metadata?.instructional ? `
## Video Metadata
${metadata.instructor ? `- **Instructor:** ${metadata.instructor}. Create an Instructor node with this name. Connect ALL extracted techniques, positions, submissions, sweeps, guards, passes, pins, and takedowns to this instructor via TAUGHT_BY edges.` : ""}
${metadata.instructional ? `- **Instructional:** ${metadata.instructional}. Create an Instructional node with this name. Connect ALL extracted techniques, positions, submissions, sweeps, guards, passes, pins, and takedowns to this instructional via APPEARS_IN edges.` : ""}
` : ""}
## Transcription

${transcriptionText}

## Output

Extract all BJJ knowledge from the transcription above. Return a JSON object with "nodes" and "edges" arrays.`;
}
