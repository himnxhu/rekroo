import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { toCandidate } from "@/lib/candidate-mapper";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

const candidateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(5),
  role: z.string().min(1),
  location: z.string().min(1),
  salary: z.string().min(1),
  experience: z.string().optional(),
  status: z.string().optional(),
  score: z.number().int().min(0).max(100).optional(),
  lastTouch: z.string().optional(),
  nextAction: z.string().optional(),
  language: z.string().optional()
});

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 500 });
  }

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await prisma.candidate.findMany({
    where: { companyId: session.companyId },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({
    candidates: candidates.map(toCandidate),
    mode: "database"
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = candidateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid candidate payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 500 });
  }

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidate = await prisma.candidate.create({
    data: {
      companyId: session.companyId,
      ...parsed.data,
      experience: parsed.data.experience ?? "Not captured",
      status: parsed.data.status ?? "New",
      score: parsed.data.score ?? 0,
      lastTouch: parsed.data.lastTouch ?? "Created manually",
      nextAction: parsed.data.nextAction ?? "AI call pending",
      language: parsed.data.language ?? "Hinglish"
    }
  });

  return NextResponse.json(
    {
      candidate: toCandidate(candidate),
      mode: "database"
    },
    { status: 201 }
  );
}
