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

export async function totpQrDataUrl(
  username: string,
  secret: string,
): Promise<string> {
  const otpauth = authenticator.keyuri(username, ISSUER, secret);
  return QRCode.toDataURL(otpauth);
}
