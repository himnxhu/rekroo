import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { toCandidate } from "@/lib/candidate-mapper";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

const stringLike = z.union([z.string(), z.number(), z.boolean()]).transform((value) => String(value).trim());

const bulkCandidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        name: stringLike.pipe(z.string().min(1)),
        phone: stringLike.pipe(z.string().min(5)),
        role: stringLike.pipe(z.string().min(1)),
        location: stringLike.pipe(z.string().min(1)),
        salary: stringLike.pipe(z.string().min(1)),
        experience: stringLike.optional(),
        status: z.string().optional(),
        score: z.number().int().min(0).max(100).optional(),
        lastTouch: stringLike.optional(),
        nextAction: stringLike.optional(),
        language: stringLike.optional()
      })
    )
    .min(1)
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = bulkCandidateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bulk candidate payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const candidates = parsed.data.candidates.map((candidate) => ({
    ...candidate,
    experience: candidate.experience ?? "Not captured",
    status: candidate.status ?? "Queued",
    score: candidate.score ?? 0,
    lastTouch: candidate.lastTouch ?? "Uploaded from CSV",
    nextAction: candidate.nextAction ?? "AI call pending",
    language: candidate.language ?? "Hinglish"
  }));

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "DATABASE_URL is required." }, { status: 500 });
  }

  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const created = await prisma.$transaction(
    candidates.map((candidate) =>
      prisma.candidate.create({
        data: {
          companyId: session.companyId,
          ...candidate
        }
      })
    )
  );

  return NextResponse.json({
    candidates: created.map(toCandidate),
    mode: "database"
  });
}
