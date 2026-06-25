import { TokenCryptoService } from "./token-crypto.service";

const TEST_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

describe("TokenCryptoService", () => {
  let service: TokenCryptoService;

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    service = new TokenCryptoService();
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
  });

  // UT-24-01
  it("round-trips a refresh token through encrypt → decrypt", () => {
    const original = "ya29.some-google-refresh-token-xyz";
    const encrypted = service.encryptRefreshToken(original);
    const decrypted = service.decryptRefreshToken(encrypted);
    expect(decrypted).toBe(original);
  });

  // UT-24-02
  it("produces different ciphertext on each encryption of the same token", () => {
    const token = "same-token-every-time";
    const first = service.encryptRefreshToken(token);
    const second = service.encryptRefreshToken(token);
    expect(first).not.toBe(second);
    // Both still decrypt correctly
    expect(service.decryptRefreshToken(first)).toBe(token);
    expect(service.decryptRefreshToken(second)).toBe(token);
  });

  // UT-24-03
  it("generateCodeChallenge returns SHA-256 base64url of the verifier", () => {
    const { createHash } = require("crypto");
    const verifier = service.generateCodeVerifier();
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(service.generateCodeChallenge(verifier)).toBe(expected);
  });

  it("generateCodeVerifier produces a non-empty base64url string", () => {
    const verifier = service.generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(verifier.length).toBeGreaterThan(30);
  });
});
