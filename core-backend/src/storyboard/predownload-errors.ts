export class NonS3UrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonS3UrlError";
  }
}

export class PredownloadError extends Error {
  constructor(
    public readonly failures: Array<{ sceneId: string; field: "audioUrl" | "videoUrl"; url: string; reason: string }>
  ) {
    super(`Asset pre-download failed: ${failures.length} download(s) failed`);
    this.name = "PredownloadError";
  }
}
