import { Module } from "@nestjs/common";
import { TokenCryptoService } from "./token-crypto.service";
import { YouTubeAuthService } from "./youtube-auth.service";
import { YouTubeUploadService } from "./youtube-upload.service";
import { YouTubeVisibilityService } from "./youtube-visibility.service";
import { YouTubeController } from "./youtube.controller";
import { GatewayModule } from "../gateway/gateway.module";

@Module({
  imports: [GatewayModule],
  controllers: [YouTubeController],
  providers: [
    TokenCryptoService,
    YouTubeAuthService,
    YouTubeUploadService,
    YouTubeVisibilityService,
  ],
  exports: [YouTubeUploadService, YouTubeAuthService],
})
export class YouTubeModule {}
