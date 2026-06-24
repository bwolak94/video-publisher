import { Controller, Get } from "@nestjs/common";
import { configuration } from "../config/configuration";
import * as crypto from "crypto";

/**
 * Exposes the RS256 public key as a JWKS endpoint for inter-service JWT verification.
 * Rule #4 (TASK-07): "Public key exposed at /.well-known/jwks.json"
 */
@Controller(".well-known")
export class JwksController {
  @Get("jwks.json")
  getJwks() {
    const { publicKey } = configuration().jwt;

    if (!publicKey) {
      // No key configured (dev/test) — return empty keyset
      return { keys: [] };
    }

    try {
      const keyObject = crypto.createPublicKey(publicKey);
      const jwk = keyObject.export({ format: "jwk" });
      return {
        keys: [
          {
            ...jwk,
            use: "sig",
            alg: "RS256",
            kid: "core-backend-1",
          },
        ],
      };
    } catch {
      return { keys: [] };
    }
  }
}
