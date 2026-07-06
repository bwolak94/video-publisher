import { Module } from "@nestjs/common";
import { AvatarController } from "./avatar.controller";
import { AvatarService } from "./avatar.service";
import { AvatarProviderRegistry } from "./avatar-provider-registry";
import { HeyGenService, HEYGEN_HTTP } from "./heygen.service";
import { DIDService, DID_HTTP } from "./did.service";
import { Wav2LipService } from "./wav2lip.service";
import { SettingsModule } from "../settings/settings.module";

@Module({
  imports: [SettingsModule],
  controllers: [AvatarController],
  providers: [
    { provide: HEYGEN_HTTP, useValue: fetch },
    { provide: DID_HTTP, useValue: fetch },
    HeyGenService,
    DIDService,
    Wav2LipService,
    {
      provide: AvatarProviderRegistry,
      useFactory: (heygen: HeyGenService, did: DIDService, wav2lip: Wav2LipService) => {
        const registry = new AvatarProviderRegistry();
        // Register all providers — registry sorts by composite score at runtime
        registry.register(wav2lip);  // score 29 — preferred (free/local)
        registry.register(heygen);   // score 27
        registry.register(did);      // score 26
        return registry;
      },
      inject: [HeyGenService, DIDService, Wav2LipService],
    },
    AvatarService,
  ],
  exports: [AvatarService, AvatarProviderRegistry],
})
export class AvatarModule {}
