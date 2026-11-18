import "server-only";
import { authenticator } from "otplib";
import QRCode from "qrcode";

const ISSUER = "StockWallet";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

/**
 * Verify a code AND return which time-step it matched, so the caller can reject
 * replays of an already-used step. Returns the absolute step number on success
 * (authenticator epoch-step, monotonically increasing), or null on no match.
 */
export function verifyTotpStep(token: string, secret: string): number | null {
  try {
    const delta = authenticator.checkDelta(token, secret);
    if (delta == null) return null;
    const period = authenticator.options.step ?? 30;
    const currentStep = Math.floor(Date.now() / 1000 / period);
    return currentStep + delta;
  } catch {
    return null;
  }
}

export async function totpQrDataUrl(
  username: string,
  secret: string,
): Promise<string> {
  const otpauth = authenticator.keyuri(username, ISSUER, secret);
  return QRCode.toDataURL(otpauth);
}
