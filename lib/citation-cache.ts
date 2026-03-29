export interface Citation {
  index: number;
  video_id: string;
  video_title: string;
  start_time: number | null;
  citation: string;
}

// In-memory cache of the most recent citations per user.
// Overwritten on each chat query, only needs to survive long enough
// for the client to fetch them via GET /api/chat/citations.
export const citationCache = new Map<string, Citation[]>();
