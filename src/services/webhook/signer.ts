import crypto from "crypto";

const ALGORITHM = "sha256";
const HEADER_NAME = "X-Webhook-Signature";
const TIMESTAMP_HEADER = "X-Webhook-Timestamp";
const TOLERANCE_SECONDS = 300; // 5 minutes

export class WebhookSigner {
  /**
   * Signs a webhook payload using HMAC-SHA256.
   * Signature format: t=<timestamp>,v1=<hmac>
   */
  static sign(payload: string, secret: string, timestamp?: number): { signature: string; timestamp: number } {
    const ts = timestamp || Math.floor(Date.now() / 1000);
    const signedContent = `${ts}.${payload}`;
    const hmac = crypto.createHmac(ALGORITHM, secret).update(signedContent).digest("hex");
    return {
      signature: `t=${ts},v1=${hmac}`,
      timestamp: ts,
    };
  }

  /**
   * Verifies a webhook signature.
   * Returns true if valid, throws if invalid or expired.
   */
  static verify(payload: string, signature: string, secret: string): boolean {
    const parts = signature.split(",").reduce((acc: Record<string, string>, part) => {
      const [key, value] = part.split("=", 2);
      acc[key] = value;
      return acc;
    }, {});

    const timestamp = parseInt(parts.t);
    if (isNaN(timestamp)) throw new Error("Invalid signature: missing timestamp");

    // Replay protection
    const age = Math.floor(Date.now() / 1000) - timestamp;
    if (age > TOLERANCE_SECONDS) throw new Error(`Webhook too old: ${age}s > ${TOLERANCE_SECONDS}s tolerance`);
    if (age < -TOLERANCE_SECONDS) throw new Error("Webhook timestamp is in the future");

    const expectedHmac = parts.v1;
    if (!expectedHmac) throw new Error("Invalid signature: missing v1 hash");

    const signedContent = `${timestamp}.${payload}`;
    const actualHmac = crypto.createHmac(ALGORITHM, secret).update(signedContent).digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(expectedHmac, "hex"), Buffer.from(actualHmac, "hex"))) {
      throw new Error("Invalid signature: HMAC mismatch");
    }

    return true;
  }

  /**
   * Generates a random webhook secret.
   */
  static generateSecret(): string {
    return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
  }
}
