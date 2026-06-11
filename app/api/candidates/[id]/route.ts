import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { toCandidate } from "@/lib/candidate-mapper";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

const updateCandidateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(5).optional(),
  role: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  salary: z.string().min(1).optional(),
  experience: z.string().optional(),
  status: z.string().optional(),
  score: z.number().int().min(0).max(100).optional(),
  lastTouch: z.string().optional(),
  nextAction: z.string().optional(),
  language: z.string().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateCandidateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid candidate update payload", details: parsed.error.flatten() },
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

  const existing = await prisma.candidate.findFirst({
    where: { id, companyId: session.companyId }
  });

  if (!existing) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const candidate = await prisma.candidate.update({
    where: { id },
    data: parsed.data
  });

  return NextResponse.json({
    candidate: toCandidate(candidate),
    mode: "database"
  });
}
