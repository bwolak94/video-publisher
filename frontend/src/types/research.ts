export type SearchDepth = "quick" | "standard" | "deep";
export type ResearchSourceType = "google" | "reddit" | "news" | "duckduckgo";

export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  source: ResearchSourceType;
  publishedAt?: string;
}

export interface ResearchBrief {
  topic: string;
  keyPoints: string[];
  trendingAngles: string[];
  audienceInsights: string[];
  sources: ResearchSource[];
  searchDepth: SearchDepth;
  searchCount: number;
  generatedAt: string;
}
