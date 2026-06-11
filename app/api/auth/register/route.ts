import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, setSession } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  companyName: z.string().min(2)
});

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is required for accounts." }, { status: 500 });
  }

  const parsed = registerSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid signup details", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const company = await prisma.company.create({
    data: {
      name: parsed.data.companyName,
      users: {
        create: {
          name: parsed.data.name,
          email: parsed.data.email.toLowerCase(),
          passwordHash: hashPassword(parsed.data.password),
          role: "owner"
        }
      }
    },
    include: { users: true }
  });
  const user = company.users[0];

  await setSession({
    userId: user.id,
    companyId: company.id,
    email: user.email,
    name: user.name,
    companyName: company.name
  });

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    company: { id: company.id, name: company.name }
  });
}
