import { Test } from "@nestjs/testing";
import { StableDiffusionService, SD_HTTP } from "./stable-diffusion.service";

const PROMPT = "Aerial shot of New York City skyline at sunset";
const S3_KEY = "images/sdcache123.png";
const BASE64_IMAGE = Buffer.from("fake-png-data").toString("base64");

async function buildService(mockFetch: jest.Mock, sdApiUrl?: string) {
  const savedUrl = process.env.SD_API_URL;
  if (sdApiUrl !== undefined) {
    process.env.SD_API_URL = sdApiUrl;
  } else {
    delete process.env.SD_API_URL;
  }

  const module = await Test.createTestingModule({
    providers: [
      StableDiffusionService,
      { provide: SD_HTTP, useValue: mockFetch },
    ],
  }).compile();

  const svc = module.get(StableDiffusionService);

  // Restore env
  if (savedUrl !== undefined) process.env.SD_API_URL = savedUrl;
  else delete process.env.SD_API_URL;

  return svc;
}

describe("StableDiffusionService", () => {
  it("isAvailable() returns false when SD_API_URL not set", async () => {
    const svc = await buildService(jest.fn(), undefined);
    expect(svc.isAvailable()).toBe(false);
  });

  it("isAvailable() returns true when SD_API_URL is set", async () => {
    const svc = await buildService(jest.fn(), "http://localhost:7860");
    expect(svc.isAvailable()).toBe(true);
  });

  it("generateAndUpload posts to AUTOMATIC1111 endpoint and uploads base64 to S3", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ images: [BASE64_IMAGE] }),
    });

    const svc = await buildService(mockFetch, "http://localhost:7860");
    (svc as any).s3 = { send: jest.fn().mockResolvedValue({}) };
    (svc as any).bucket = "test-bucket";
    (svc as any).sdApiUrl = "http://localhost:7860";

    const result = await svc.generateAndUpload(PROMPT, 1792, 1024, S3_KEY);

    expect(result).toBe(`s3://test-bucket/${S3_KEY}`);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:7860/sdapi/v1/txt2img",
      expect.objectContaining({ method: "POST" })
    );
    expect((svc as any).s3.send).toHaveBeenCalledTimes(1);
  });

  it("throws when SD_API_URL not set", async () => {
    const svc = await buildService(jest.fn(), undefined);
    (svc as any).sdApiUrl = undefined;

    await expect(svc.generateAndUpload(PROMPT, 1024, 1024, S3_KEY)).rejects.toThrow(
      "SD_API_URL not configured"
    );
  });
});
