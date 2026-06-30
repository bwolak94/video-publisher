import { Controller, Post, Body, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import pino from "pino";
import { configuration } from "../config/configuration";
import { ProjectsService } from "../projects/projects.service";

const logger = pino({ level: "info" });

interface ResearchBody {
  topic: string;
  depth?: "quick" | "standard" | "deep";
}

interface AnalyzeReferenceBody {
  videoUrl: string;
}

interface OutlineBody {
  topic?: string;
  message?: string;
  language?: string;
  voiceId?: string;
  projectId?: string;
  researchBrief?: Record<string, unknown>;
  referenceAnalysis?: Record<string, unknown>;
}

interface StoryboardBody {
  outline: string[];
  language?: string;
  voiceId?: string;
  projectId?: string;
  sceneCount?: number;
  targetDurationSeconds?: number;
  aspectRatio?: string;
  researchBrief?: Record<string, unknown>;
  referenceAnalysis?: Record<string, unknown>;
  referenceVideoUrl?: string;
}

@Controller("api/creator")
export class CreatorController {
  private readonly aiBackendUrl: string;

  constructor(private readonly projectsService: ProjectsService) {
    this.aiBackendUrl = configuration().worker.aiBackendUrl;
  }

  @Post("analyze-reference")
  async analyzeReference(@Body() body: AnalyzeReferenceBody): Promise<unknown> {
    const { videoUrl } = body;
    logger.info({ videoUrl }, "Proxying analyze-reference request to ai-backend");

    let aiRes: Response;
    try {
      aiRes = await fetch(`${this.aiBackendUrl}/api/creator/analyze-reference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl }),
      });
    } catch (err) {
      logger.error({ err }, "ai-backend unreachable for analyze-reference");
      throw new Error("AI backend unavailable");
    }

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      logger.error({ status: aiRes.status, text }, "ai-backend analyze-reference error");
      throw new Error(`Reference analysis failed: ${text}`);
    }

    return aiRes.json();
  }

  @Post("research")
  async research(@Body() body: ResearchBody): Promise<unknown> {
    const { topic, depth = "standard" } = body;
    logger.info({ topic, depth }, "Proxying research request to ai-backend");

    let aiRes: Response;
    try {
      aiRes = await fetch(`${this.aiBackendUrl}/api/creator/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, depth }),
      });
    } catch (err) {
      logger.error({ err }, "ai-backend unreachable for research");
      throw new Error("AI backend unavailable");
    }

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      logger.error({ status: aiRes.status, text }, "ai-backend research error");
      throw new Error(`Research failed: ${text}`);
    }

    return aiRes.json();
  }

  @Post("outline")
  async outline(@Body() body: OutlineBody, @Res() reply: FastifyReply): Promise<void> {
    const topic = body.topic ?? body.message ?? "";

    logger.info({ topic, language: body.language }, "Proxying creator outline to ai-backend");

    let aiRes: Response;
    try {
      aiRes = await fetch(`${this.aiBackendUrl}/api/creator/outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          language: body.language ?? "en",
          voiceId: body.voiceId ?? "default",
          projectId: body.projectId ?? null,
          researchBrief: body.researchBrief ?? null,
          referenceAnalysis: body.referenceAnalysis ?? null,
        }),
      });
    } catch (err) {
      logger.error({ err }, "ai-backend unreachable for creator outline");
      reply.code(503).send({ error: "AI backend unavailable" });
      return;
    }

    if (!aiRes.ok || !aiRes.body) {
      const text = await aiRes.text().catch(() => "");
      logger.error({ status: aiRes.status, text }, "ai-backend outline error");
      reply.code(aiRes.status).send({ error: text || "AI backend error" });
      return;
    }

    reply.raw.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "http://localhost:3000");
    reply.raw.setHeader("Access-Control-Allow-Credentials", "true");
    reply.raw.setHeader("Content-Type", "text/plain; charset=utf-8");
    reply.raw.setHeader("Transfer-Encoding", "chunked");

    const reader = aiRes.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply.raw.write(Buffer.from(value));
      }
    } finally {
      reply.raw.end();
    }
  }

  @Post("storyboard")
  async storyboard(@Body() body: StoryboardBody): Promise<unknown> {
    logger.info({ outlineLength: body.outline?.length }, "Proxying creator storyboard to ai-backend");

    let aiRes: Response;
    try {
      aiRes = await fetch(`${this.aiBackendUrl}/api/creator/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outline: body.outline ?? [],
          language: body.language ?? "en",
          voiceId: body.voiceId ?? "default",
          projectId: body.projectId ?? null,
          sceneCount: body.sceneCount ?? 8,
          targetDurationSeconds: body.targetDurationSeconds ?? 40,
          aspectRatio: body.aspectRatio ?? "16:9",
          researchBrief: body.researchBrief ?? null,
          referenceAnalysis: body.referenceAnalysis ?? null,
        }),
      });
    } catch (err) {
      logger.error({ err }, "ai-backend unreachable for creator storyboard");
      throw new Error("AI backend unavailable");
    }

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => "");
      logger.error({ status: aiRes.status, text }, "ai-backend storyboard error");
      throw new Error(`AI backend error: ${text}`);
    }

    const data = await aiRes.json() as { storyboard: Record<string, unknown>; projectId: string };

    // Save the project + storyboard to the DB so scene endpoints can look them up
    const title = (data.storyboard?.meta as any)?.title ?? "Untitled";
    const project = await this.projectsService.createWithStoryboard(
      title,
      data.storyboard,
      undefined,
      body.researchBrief ?? null,
      body.referenceVideoUrl ?? null,
      body.referenceAnalysis ?? null,
    );

    logger.info({ projectId: project.id, scenes: (data.storyboard?.timeline as any[])?.length }, "Project saved to DB");

    return { storyboard: data.storyboard, projectId: project.id };
  }
}
