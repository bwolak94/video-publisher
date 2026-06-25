import { Injectable } from "@nestjs/common";
import { NICHE_PROFILES, type NicheProfile } from "./presets";

const DEFAULT_PROFILE_ID = "tech";

@Injectable()
export class NicheProfileService {
  private readonly profileMap = new Map<string, NicheProfile>(
    NICHE_PROFILES.map((p) => [p.id, p])
  );

  getById(id: string): NicheProfile {
    return this.profileMap.get(id) ?? this.profileMap.get(DEFAULT_PROFILE_ID)!;
  }

  getAll(): NicheProfile[] {
    return NICHE_PROFILES;
  }
}
