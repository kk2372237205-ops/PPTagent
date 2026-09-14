import { createHmac, timingSafeEqual } from "crypto";

const encode = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function signJwt(payload: Record<string, unknown>, expiresInSeconds = 3600) {
  const secret = process.env.ONLYOFFICE_JWT_SECRET || "development-onlyoffice-secret";
  const header = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds }));
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string) {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return false;
    const secret = process.env.ONLYOFFICE_JWT_SECRET || "development-onlyoffice-secret";
    const expected = createHmac("sha256", secret).update(`${header}.${body}`).digest();
    const received = Buffer.from(signature, "base64url");
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return !payload.exp || payload.exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function signFileToken(id: string, expiresAt = Date.now() + 60 * 60 * 1000) {
  const secret = process.env.ONLYOFFICE_JWT_SECRET || "development-onlyoffice-secret";
  const value = `${id}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(value).digest("base64url");
  return `${expiresAt}.${signature}`;
}

export function verifyFileToken(id: string, token: string | null) {
  if (!token) return false;
  const [expiresText, signature] = token.split(".");
  const expiresAt = Number(expiresText);
  if (!expiresAt || expiresAt < Date.now() || !signature) return false;
  const expected = signFileToken(id, expiresAt).split(".")[1];
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}
