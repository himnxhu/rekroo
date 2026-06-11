import { NextResponse } from "next/server";
import { z } from "zod";
import { setSession, verifyPassword } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is required for login." }, { status: 500 });
  }

  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login details" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { company: true }
  });

  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await setSession({
    userId: user.id,
    companyId: user.companyId,
    email: user.email,
    name: user.name,
    companyName: user.company.name
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    company: { id: user.company.id, name: user.company.name }
  });
}
