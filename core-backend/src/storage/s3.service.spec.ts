/**
 * Unit tests for S3Service — UT-12-01..09
 */
import { S3Service } from "./s3.service";
import { S3UploadError, S3ObjectNotFoundError, S3PermissionError, ConfigurationError } from "./s3-errors";
import { Readable } from "stream";

jest.mock("@aws-sdk/client-s3");
jest.mock("@aws-sdk/s3-request-presigner");
jest.mock("@aws-sdk/lib-storage");

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";

describe("S3Service", () => {
  let service: S3Service;
  let sendMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.AWS_REGION;
    delete process.env.S3_ENDPOINT_URL;
    process.env.S3_BUCKET_NAME = "test-bucket";

    service = new S3Service();
    sendMock = jest.fn();
    (service as any).client = { send: sendMock };
  });

  afterEach(() => {
    delete process.env.S3_BUCKET_NAME;
  });

  // UT-12-01
  it("buildPath('audio', 'abc123') returns 'audio/abc123.mp3'", () => {
    expect(service.buildPath("audio", "abc123")).toBe("audio/abc123.mp3");
  });

  // UT-12-02
  it("buildPath('render', 'proj-uuid') returns path matching renders/proj-uuid/{timestamp}.mp4", () => {
    const path = service.buildPath("render", "proj-uuid");
    expect(path).toMatch(/^renders\/proj-uuid\/\d+\.mp4$/);
  });

  // UT-12-03
  it("uploadBuffer() success: send called, returns s3:// URI", async () => {
    sendMock.mockResolvedValue({});
    const buf = Buffer.from("data");
    const result = await service.uploadBuffer("audio/abc123.mp3", buf, "audio/mpeg");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result).toBe("s3://test-bucket/audio/abc123.mp3");
  });

  // UT-12-04
  it("uploadStream() failure: throws S3UploadError", async () => {
    const mockUpload = { done: jest.fn().mockRejectedValue(new Error("network error")) };
    (Upload as unknown as jest.Mock).mockImplementation(() => mockUpload);

    const stream = Readable.from(["chunk"]);
    await expect(service.uploadStream("video/key.mp4", stream, "video/mp4")).rejects.toThrow(S3UploadError);
  });

  // UT-12-05
  it("getPresignedUrl() returns HTTPS URL string", async () => {
    (getSignedUrl as jest.Mock).mockResolvedValue("https://s3.amazonaws.com/test-bucket/audio/abc123.mp3?X-Amz-Signature=xxx");
    const url = await service.getPresignedUrl("audio/abc123.mp3");
    expect(url).toMatch(/^https:\/\//);
  });

  // UT-12-06
  it("exists() when object present: returns true", async () => {
    sendMock.mockResolvedValue({});
    const result = await service.exists("audio/abc123.mp3");
    expect(result).toBe(true);
  });

  // UT-12-07
  it("exists() when NotFound: returns false, no throw", async () => {
    sendMock.mockRejectedValue({ name: "NotFound", $metadata: { httpStatusCode: 404 } });
    const result = await service.exists("audio/missing.mp3");
    expect(result).toBe(false);
  });

  // UT-12-08
  it("exists() on 403: throws S3PermissionError", async () => {
    sendMock.mockRejectedValue({ $metadata: { httpStatusCode: 403 } });
    await expect(service.exists("audio/secret.mp3")).rejects.toThrow(S3PermissionError);
  });

  // UT-12-09
  it("AWS_REGION mismatch at construction: throws ConfigurationError", () => {
    process.env.AWS_REGION = "us-east-1";
    expect(() => new S3Service()).toThrow(ConfigurationError);
  });
});
