import { Injectable } from "@nestjs/common";
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

interface EncryptedToken {
  iv: string;       // hex
  authTag: string;  // hex
  ciphertext: string; // hex
}

@Injectable()
export class TokenCryptoService {
  private get encryptionKey(): Buffer {
    const hex = process.env.TOKEN_ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
      throw new Error("TOKEN_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
    }
    return Buffer.from(hex, "hex");
  }

  encryptRefreshToken(token: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(token, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const payload: EncryptedToken = {
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
      ciphertext: ciphertext.toString("hex"),
    };
    return JSON.stringify(payload);
  }

  decryptRefreshToken(encrypted: string): string {
    const { iv, authTag, ciphertext } = JSON.parse(encrypted) as EncryptedToken;

    const decipher = createDecipheriv(
      ALGORITHM,
      this.encryptionKey,
      Buffer.from(iv, "hex")
    );
    decipher.setAuthTag(Buffer.from(authTag, "hex"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "hex")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }

  /** Generates a PKCE code verifier: 32 random bytes → base64url */
  generateCodeVerifier(): string {
    return randomBytes(32).toString("base64url");
  }

  /** Generates a PKCE code challenge: SHA-256(verifier) → base64url */
  generateCodeChallenge(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
  }
}
