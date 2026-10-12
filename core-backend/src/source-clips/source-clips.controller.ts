import { Controller, Get, Post, Patch, HttpCode, Param, Body, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { SourceClipsService } from "./source-clips.service";
import type { SourceClip } from "../db/schema";

@Controller("source-clips")
export class SourceClipsController {
  constructor(private readonly sourceClipsService: SourceClipsService) {}

  /**
   * Request a presigned S3 PUT URL so the browser can upload directly.
   * POST /source-clips/upload-url
   */
  @Post("upload-url")
  @HttpCode(200)
  getUploadUrl(
    @Body() body: { filename: string; contentType: string },
  ): Promise<{ uploadUrl: string; clipId: string; s3Key: string }> {
    return this.sourceClipsService.getUploadUrl(body.filename, body.contentType);
  }

  /**
   * Confirm a successful direct S3 upload and persist the DB row.
   * POST /source-clips/confirm
   */
  @Post("confirm")
  @HttpCode(201)
  confirmUpload(
    @Body() body: { clipId: string; filename: string; s3Key: string },
  ): Promise<{ id: string; name: string; s3Url: string }> {
    return this.sourceClipsService.confirmUpload(body.clipId, body.filename, body.s3Key);
  }

  /**
   * Upload a source video clip via multipart/form-data (server-side upload).
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
   * List all source clips, newest first.
   * GET /source-clips
   */
  @Get()
  findAll(): Promise<SourceClip[]> {
    return this.sourceClipsService.findAll();
  }

  /**
   * Retrieve a source clip by its ID.
   * GET /source-clips/:id
   */
  @Get(":id")
  findOne(@Param("id") id: string): Promise<SourceClip | null> {
    return this.sourceClipsService.findById(id);
  }

  /**
   * Update trim in/out points for a clip.
   * PATCH /source-clips/:id
   */
  @Patch(":id")
  updateTrimPoints(
    @Param("id") id: string,
    @Body() body: { inPoint: number; outPoint: number },
  ): Promise<{ id: string; inPointS: number; outPointS: number }> {
    return this.sourceClipsService.updateTrimPoints(id, body.inPoint, body.outPoint);
  }
}
