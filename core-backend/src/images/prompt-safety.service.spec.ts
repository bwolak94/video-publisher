/**
 * Unit tests for PromptSafetyService — UT-11-04, UT-11-05
 */
import { Test } from "@nestjs/testing";
import { PromptSafetyService, OPENAI_HTTP } from "./prompt-safety.service";

const SAFE_PROMPT = "Aerial drone shot of New York City skyline at sunset, photorealistic";
const UNSAFE_PROMPT = "A dramatic explosion in an urban setting with fire and smoke";
const REFORMULATED = "A dramatic scene with bright orange light and rising smoke, cinematic";

function makeOpenAIMock(reformulated: string) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      choices: [{ message: { content: reformulated } }],
    }),
  });
}

async function buildService(mockFetch: jest.Mock) {
  const module = await Test.createTestingModule({
    providers: [
      PromptSafetyService,
      { provide: OPENAI_HTTP, useValue: mockFetch },
    ],
  }).compile();
  return module.get(PromptSafetyService);
}

describe("PromptSafetyService", () => {
  // UT-11-05: clean prompt → no reformulation
  it("UT-11-05: clean prompt → safePrompt returns it unchanged, no API call", async () => {
    const mockFetch = jest.fn();
    const svc = await buildService(mockFetch);

    const result = await svc.safePrompt(SAFE_PROMPT);

    expect(result).toBe(SAFE_PROMPT);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // UT-11-04: blocklisted prompt → reformulation called
  it("UT-11-04: prompt with blocklist keyword → reformulation step called", async () => {
    const mockFetch = makeOpenAIMock(REFORMULATED);
    const svc = await buildService(mockFetch);

    const result = await svc.safePrompt(UNSAFE_PROMPT);

    expect(result).toBe(REFORMULATED);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("containsBlocklistedKeyword detects blocklisted words case-insensitively", async () => {
    const svc = await buildService(jest.fn());
    expect(svc.containsBlocklistedKeyword("A violent scene")).toBe(true);
    expect(svc.containsBlocklistedKeyword("Nude beach")).toBe(true);
    expect(svc.containsBlocklistedKeyword("Peaceful mountain landscape")).toBe(false);
  });

  it("reformulation failure throws error", async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
    const svc = await buildService(mockFetch);

    await expect((svc as any).reformulate("explosion test")).rejects.toThrow(
      "Prompt reformulation failed: 500"
    );
  });
});
