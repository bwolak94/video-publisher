import { NicheProfileService } from "./niche-profile.service";

describe("NicheProfileService", () => {
  let service: NicheProfileService;

  beforeEach(() => {
    service = new NicheProfileService();
  });

  // UT-23-01
  it("returns the correct preset by id", () => {
    const profile = service.getById("finance");
    expect(profile.id).toBe("finance");
    expect(profile.name).toBe("Finance & Markets");
    expect(profile.toneProfile).toBe("edgy");
  });

  // UT-23-02
  it("returns the 'tech' default when id is unknown", () => {
    const profile = service.getById("nonexistent-niche-xyz");
    expect(profile.id).toBe("tech");
  });

  it("returns all 15 presets from getAll()", () => {
    expect(service.getAll()).toHaveLength(15);
  });
});
