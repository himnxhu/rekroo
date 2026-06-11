import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

const SESSION_COOKIE = "rekroo_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type SessionPayload = {
  userId: string;
  companyId: string;
  email: string;
  name: string;
  companyName: string;
};

function getSessionSecret() {
  return process.env.AUTH_SECRET || "rekroo-local-development-secret";
}

function signPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const candidate = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

export function createSessionToken(payload: SessionPayload) {
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE
    })
  ).toString("base64url");
  return `${body}.${signPayload(body)}`;
}

export function parseSessionToken(token?: string): SessionPayload | null {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature || signPayload(body) !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload & {
      exp: number;
    };
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      userId: payload.userId,
      companyId: payload.companyId,
      email: payload.email,
      name: payload.name,
      companyName: payload.companyName
    };
  } catch {
    return null;
  }
}

export async function setSession(payload: SessionPayload) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  return parseSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireSession() {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { company: true }
  });

  if (!user) return null;

  return {
    userId: user.id,
    companyId: user.companyId,
    email: user.email,
    name: user.name,
    companyName: user.company.name,
    role: user.role
  };
}
