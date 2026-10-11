import { Controller, Get, Post, HttpCode, Param, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { SourceClipsService } from "./source-clips.service";
import type { SourceClip } from "../db/schema";

@Controller("source-clips")
export class SourceClipsController {
  constructor(private readonly sourceClipsService: SourceClipsService) {}

  /**
   * Upload a source video clip for use in V2V generation.
   * Expects a multipart/form-data request with a single file field.
   * POST /source-clips
   */
  @Post()
  @HttpCode(201)
  async upload(@Req() req: FastifyRequest): Promise<SourceClip> {
    // @fastify/multipart is registered globally on the Fastify instance
    const data = await (req as any).file() as {
      filename: string;
      mimetype: string;
      toBuffer: () => Promise<Buffer>;
    };
    const buffer = await data.toBuffer();
    return this.sourceClipsService.upload({
      buffer,
      originalname: data.filename,
      mimetype: data.mimetype,
    });
  }

  /**
   * Retrieve a source clip by its ID.
   * GET /source-clips/:id
   */
  @Get(":id")
  findOne(@Param("id") id: string): Promise<SourceClip | null> {
    return this.sourceClipsService.findById(id);
  }
}
