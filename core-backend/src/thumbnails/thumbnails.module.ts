import { Module } from "@nestjs/common";
import { ThumbnailTestService } from "./thumbnail-test.service";
import { ThumbnailsController } from "./thumbnails.controller";
import { ImagesModule } from "../images/images.module";
import { YouTubeModule } from "../youtube/youtube.module";

@Module({
  imports: [ImagesModule, YouTubeModule],
  controllers: [ThumbnailsController],
  providers: [ThumbnailTestService],
  exports: [ThumbnailTestService],
})
export class ThumbnailsModule {}
