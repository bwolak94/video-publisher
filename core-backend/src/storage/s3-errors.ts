export class S3UploadError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "S3UploadError";
  }
}

export class S3ObjectNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`S3 object not found: ${key}`);
    this.name = "S3ObjectNotFoundError";
  }
}

export class S3PermissionError extends Error {
  constructor(public readonly key: string) {
    super(`S3 permission denied for key: ${key}`);
    this.name = "S3PermissionError";
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}
