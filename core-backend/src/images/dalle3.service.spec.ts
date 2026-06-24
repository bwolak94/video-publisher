/**
 * Unit tests for DallE3Service — UT-11-06
 */
import { Test } from "@nestjs/testing";
import { DallE3Service, DALLE_HTTP } from "./dalle3.service";

const DALLE_DELIVERY_URL = "https://oaidalleapiprodscus.blob.core.windows.net/output/img.png";
const S3_KEY = "images/deadbeef.png";
const S3_URL = `s3://test-bucket/${S3_KEY}`;
const PROMPT = "Aerial shot of New York City skyline at sunset";
const SIZE = "1792x1024";

async function buildService(mockFetch: jest.Mock) {
  const module = await Test.createTestingModule({
    providers: [
      DallE3Service,
      { provide: DALLE_HTTP, useValue: mockFetch },
    ],
  }).compile();
  return module.get(DallE3Service);
}

describe("DallE3Service", () => {
  // UT-11-06: DALL-E URL downloaded and putObject called on S3
  it("UT-11-06: generateAndUpload calls S3 putObject after downloading DALL-E URL", async () => {
    // First fetch: DALL-E API → returns delivery URL
    // Second fetch: download from DALL-E CDN → returns image buffer
    const mockFetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          data: [{ url: DALLE_DELIVERY_URL }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024)),
      });

    const svc = await buildService(mockFetch);
    (svc as any).s3 = { send: jest.fn().mockResolvedValue({}) };
    // Override bucket so we can assert s3Url
    (svc as any).bucket = "test-bucket";

    const result = await svc.generateAndUpload(PROMPT, SIZE, S3_KEY);

    expect(result).toBe(S3_URL);
    expect((svc as any).s3.send).toHaveBeenCalledTimes(1); // one putObject
    expect(mockFetch).toHaveBeenCalledTimes(2); // API call + CDN download
  });

  it("DALL-E API error (429) throws with status", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
    });
    const svc = await buildService(mockFetch);

    const err: any = await svc.generateAndUpload(PROMPT, SIZE, S3_KEY).catch((e) => e);
    expect(err.status).toBe(429);
  });

  it("generate() posts correct model and size to OpenAI", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ data: [{ url: DALLE_DELIVERY_URL }] }),
    });
    const svc = await buildService(mockFetch);

    await (svc as any).generate(PROMPT, SIZE);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe("dall-e-3");
    expect(body.size).toBe(SIZE);
    expect(body.n).toBe(1);
  });

  it("downloadToS3 does not call fs.writeFile", async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
    const svc = await buildService(mockFetch);
    (svc as any).s3 = { send: jest.fn().mockResolvedValue({}) };

    const fs = require("fs");
    const writeSpy = jest.spyOn(fs, "writeFile");
    const writeFileSyncSpy = jest.spyOn(fs, "writeFileSync");

    await (svc as any).downloadToS3(DALLE_DELIVERY_URL, S3_KEY);

    expect(writeSpy).not.toHaveBeenCalled();
    expect(writeFileSyncSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
  });
});
