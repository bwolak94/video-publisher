import { Controller, Get, Post, Delete, Param, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { VoiceCloningService } from "./voice-cloning.service";

/**
 * Voice management endpoints (listing + cloning via ElevenLabs).
 *
 * GET    /api/voices          — list all available voices (pre-built + cloned)
 * POST   /api/voices/clone    — create an instant voice clone from an S3 audio file
 * DELETE /api/voices/:id      — delete a user-cloned voice
 */
@Controller("api/voices")
export class VoicesController {
  constructor(private readonly cloning: VoiceCloningService) {}

  @Get()
  async list() {
    return this.cloning.listVoices();
  }

  @Post("clone")
  @HttpCode(HttpStatus.CREATED)
  async clone(
    @Body()
    body: {
      name: string;
      audioS3Key: string;
      description?: string;
      labels?: Record<string, string>;
    },
  ) {
    return this.cloning.cloneVoice(
      body.name,
      body.audioS3Key,
      body.description,
      body.labels,
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    await this.cloning.deleteVoice(id);
  }
}
