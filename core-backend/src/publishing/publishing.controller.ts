import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { PublisherRegistry } from "./publisher.registry";
import type { Platform, PublishOptions, PublishResult } from "./video-publisher.interface";

interface PublishBody extends PublishOptions {
  platforms: Platform[];
}

@Controller("api/publish")
export class PublishingController {
  constructor(private readonly registry: PublisherRegistry) {}

  /**
   * Publish a video to one or more platforms in parallel.
   * Returns per-platform results; individual failures don't block others.
   */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async publish(@Body() body: PublishBody): Promise<PublishResult[]> {
    const { platforms, ...options } = body;
    const results = await Promise.allSettled(
      platforms.map((platform) => this.registry.get(platform).upload(options))
    );
    return results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { platform: platforms[i], platformVideoId: "", error: (r.reason as Error).message } as any;
    });
  }
}
