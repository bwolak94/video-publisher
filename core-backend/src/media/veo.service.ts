import { Injectable, Inject } from "@nestjs/common";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as crypto from "crypto";
import pino from "pino";
import { CircuitBreaker } from "../elevenlabs/circuit-breaker";
import { VideoCacheService } from "./video-cache.service";
import { SettingsService } from "../settings/settings.service";
import type { VideoProvider, VideoGenerateParams, ProviderScores } from "./video-provider.interface";

const logger = pino({ level: "info" });

export const VEO_HTTP = Symbol("VEO_HTTP");

const MODEL_ID = "veo-3.0-generate-preview";
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 300_000; // 5 min — Veo can take 2-4 min per clip
const DURATION_SECONDS = 8;

/**
 * Google Veo 3 video generation provider via Vertex AI.
 *
 * Auth: Google Cloud service account JSON (RS256 JWT → OAuth2 token exchange).
 *       Store the full service account JSON string in Settings → Integrations → googleCloudKeyJson.
 *
 * Config keys (all in Settings → Integrations):
 *   googleCloudProjectId      — GCP project ID  (e.g. "my-video-project")
 *   googleCloudLocation       — Vertex AI region (default: "us-central1")
 *   googleCloudStorageBucket  — GCS bucket where Veo writes output videos (e.g. "my-veo-outputs")
 *   googleCloudKeyJson        — full service account JSON string (encrypted at rest)
 *
 * Flow:
 *   1. Exchange service account JWT for an OAuth2 access token
 *   2. POST predictLongRunning → operation name
 *   3. Poll operation until done === true
 *   4. Download video from GCS URI (gs://bucket/path) → re-upload to MinIO/S3
 *   5. Cache and return s3:// URL
 */
@Injectable()
export class VeoService implements VideoProvider {
  readonly name = "veo";

  readonly scores: ProviderScores = {
    quality: 5,
    cost: 2,
    reliability: 4,
    latency: 2, // Veo generation averages 2-4 min
  };

  private readonly breaker = new CircuitBreaker("veo", 5, 60_000);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly cache: VideoCacheService,
    @Inject(VEO_HTTP) private readonly httpFetch: typeof fetch,
    private readonly settings: SettingsService,
  ) {
    this.bucket = process.env.S3_BUCKET ?? process.env.S3_BUCKET_NAME ?? "video-publisher-assets";
    this.s3 = new S3Client({
      region: process.env.AWS_REGION ?? "eu-central-1",
      ...(process.env.S3_ENDPOINT_URL
        ? { endpoint: process.env.S3_ENDPOINT_URL, forcePathStyle: true }
        : {}),
    });
  }

  async isAvailable(): Promise<boolean> {
    const { projectId, keyJson } = await this.getConfig();
    return !!(projectId && keyJson);
  }

  async generate(params: VideoGenerateParams): Promise<string> {
    const { visualPrompt, aspectRatio = "16:9", sceneId } = params;

    const cacheKey = this.cache.computeCacheKey(visualPrompt, MODEL_ID, aspectRatio);
    const cached = await this.cache.getCached(cacheKey);
    if (cached) {
      logger.info({ cacheKey, sceneId }, "Veo cache hit");
      return cached;
    }

    const gcsUri = await this.breaker.execute(() =>
      this.generateAndPoll(visualPrompt, aspectRatio),
    );

    const s3Key = `video/${cacheKey}.mp4`;
    const s3Url = await this.downloadGcsToS3(gcsUri, s3Key);
    await this.cache.setCached(cacheKey, s3Url);

    logger.info({ cacheKey, sceneId, modelId: MODEL_ID }, "Veo video generated and cached");
    return s3Url;
  }

  // ── Private methods ──────────────────────────────────────────────────────────

  private async generateAndPoll(
    prompt: string,
    aspectRatio: "16:9" | "9:16",
  ): Promise<string> {
    const { projectId, location, storageBucket } = await this.getConfig();
    const accessToken = await this.getAccessToken();

    const operationName = await this.submitGeneration(
      accessToken,
      projectId,
      location,
      storageBucket,
      prompt,
      aspectRatio,
    );

    return this.pollOperation(accessToken, location, projectId, operationName);
  }

  protected async submitGeneration(
    accessToken: string,
    projectId: string,
    location: string,
    storageBucket: string,
    prompt: string,
    aspectRatio: "16:9" | "9:16",
  ): Promise<string> {
    const endpoint =
      `https://${location}-aiplatform.googleapis.com/v1beta1` +
      `/projects/${projectId}/locations/${location}` +
      `/publishers/google/models/${MODEL_ID}:predictLongRunning`;

    const response = await this.httpFetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          storageUri: `gs://${storageBucket}/veo-outputs/`,
          durationSeconds: DURATION_SECONDS,
          aspectRatio,
          sampleCount: 1,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const err: any = new Error(`Veo generation request failed: HTTP ${response.status} — ${body}`);
      err.status = response.status;
      throw err;
    }

    const data: any = await response.json();
    if (!data.name) {
      throw new Error(`Veo API returned no operation name: ${JSON.stringify(data)}`);
    }

    logger.info({ operationName: data.name }, "Veo operation submitted");
    return data.name as string;
  }

  protected async pollOperation(
    accessToken: string,
    location: string,
    projectId: string,
    operationName: string,
  ): Promise<string> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.sleep(POLL_INTERVAL_MS);

      const response = await this.httpFetch(
        `https://${location}-aiplatform.googleapis.com/v1/${operationName}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const err: any = new Error(`Veo operation poll failed: HTTP ${response.status} — ${body}`);
        err.status = response.status;
        throw err;
      }

      const op: any = await response.json();

      if (op.error) {
        throw new Error(`Veo operation error: ${op.error.message} (code ${op.error.code})`);
      }

      if (op.done) {
        const samples = op.response?.generatedSamples ?? op.response?.videos ?? [];
        const gcsUri =
          samples[0]?.video?.uri ??
          samples[0]?.gcsUri ??
          samples[0]?.uri;

        if (!gcsUri) {
          throw new Error(
            `Veo operation completed but no video URI in response: ${JSON.stringify(op.response)}`,
          );
        }

        logger.info({ operationName, gcsUri }, "Veo operation completed");
        return gcsUri as string;
      }

      const pct = op.metadata?.progressPercent ?? 0;
      logger.debug({ operationName, pct }, "Veo operation in progress");
    }

    throw new Error(
      `Veo operation timeout after ${POLL_TIMEOUT_MS / 1000}s (operation=${operationName})`,
    );
  }

  /**
   * Download a GCS object (gs://bucket/path) to MinIO/S3 using the GCS JSON API.
   * The same Google OAuth2 access token is used for both Vertex AI and GCS.
   */
  protected async downloadGcsToS3(gcsUri: string, s3Key: string): Promise<string> {
    const urlHash = this.cache.computeUrlHash(gcsUri);
    const existing = await this.cache.getCachedByUrlHash(urlHash);
    if (existing) return existing;

    // gs://bucket/some/path/video.mp4  →  bucket, some/path/video.mp4
    const withoutScheme = gcsUri.replace(/^gs:\/\//, "");
    const slashIdx = withoutScheme.indexOf("/");
    const gcsBucket = withoutScheme.slice(0, slashIdx);
    const gcsObject = encodeURIComponent(withoutScheme.slice(slashIdx + 1));

    const accessToken = await this.getAccessToken();
    const downloadUrl =
      `https://storage.googleapis.com/download/storage/v1` +
      `/b/${gcsBucket}/o/${gcsObject}?alt=media`;

    const response = await this.httpFetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download Veo output from GCS: HTTP ${response.status} (uri=${gcsUri})`,
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
        Body: buffer,
        ContentType: "video/mp4",
      }),
    );

    const s3Url = `s3://${this.bucket}/${s3Key}`;
    await this.cache.setCachedByUrlHash(urlHash, s3Url);
    logger.info({ gcsUri, s3Url }, "Veo video moved from GCS to S3");
    return s3Url;
  }

  // ── Google Cloud authentication ──────────────────────────────────────────────

  /**
   * Exchange a signed RS256 service-account JWT for a short-lived OAuth2 access token.
   * Token lifetime is 1 h; for simplicity we re-request on every call (tokens are cached
   * externally by the circuit breaker / job TTL — each generation job takes <5 min).
   */
  private async getAccessToken(): Promise<string> {
    const { keyJson } = await this.getConfig();
    const sa = JSON.parse(keyJson) as {
      client_email: string;
      private_key: string;
      token_uri?: string;
    };

    const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
    const nowSec = Math.floor(Date.now() / 1000);

    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        iss: sa.client_email,
        sub: sa.client_email,
        scope: "https://www.googleapis.com/auth/cloud-platform",
        aud: tokenUri,
        iat: nowSec,
        exp: nowSec + 3600,
      }),
    ).toString("base64url");

    const signingInput = `${header}.${payload}`;
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signingInput);
    const signature = sign.sign(sa.private_key, "base64url");
    const jwt = `${signingInput}.${signature}`;

    const response = await this.httpFetch(tokenUri, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }).toString(),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Google OAuth2 token exchange failed: HTTP ${response.status} — ${body}`);
    }

    const data: any = await response.json();
    return data.access_token as string;
  }

  private async getConfig(): Promise<{
    projectId: string;
    location: string;
    storageBucket: string;
    keyJson: string;
  }> {
    const [projectId, location, storageBucket, keyJson] = await Promise.all([
      process.env.GOOGLE_CLOUD_PROJECT_ID
        ? Promise.resolve(process.env.GOOGLE_CLOUD_PROJECT_ID)
        : this.settings.getPlaintext("integrations.googleCloudProjectId"),
      process.env.GOOGLE_CLOUD_LOCATION
        ? Promise.resolve(process.env.GOOGLE_CLOUD_LOCATION)
        : this.settings
            .getPlaintext("integrations.googleCloudLocation")
            .then((v) => v ?? "us-central1"),
      process.env.GOOGLE_CLOUD_STORAGE_BUCKET
        ? Promise.resolve(process.env.GOOGLE_CLOUD_STORAGE_BUCKET)
        : this.settings.getPlaintext("integrations.googleCloudStorageBucket"),
      process.env.GOOGLE_CLOUD_KEY_JSON
        ? Promise.resolve(process.env.GOOGLE_CLOUD_KEY_JSON)
        : this.settings.getPlaintext("integrations.googleCloudKeyJson"),
    ]);

    return {
      projectId: projectId ?? "",
      location: location ?? "us-central1",
      storageBucket: storageBucket ?? "",
      keyJson: keyJson ?? "",
    };
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
