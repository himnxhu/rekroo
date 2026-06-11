import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";

const reminderSchema = z.object({
  candidateId: z.string().min(1),
  template: z.string().min(1)
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = reminderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid WhatsApp reminder payload", details: parsed.error.flatten() },
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

  const candidate = await prisma.candidate.findFirst({
    where: { id: parsed.data.candidateId, companyId: session.companyId }
  });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const message = await prisma.whatsAppMessage.create({
    data: {
      candidateId: parsed.data.candidateId,
      template: parsed.data.template,
      status: "scheduled"
    }
  });

  await prisma.candidate.update({
    where: { id: parsed.data.candidateId },
    data: {
      lastTouch: "WhatsApp JD scheduled",
      nextAction: "Wait for confirmation"
    }
  });

  return NextResponse.json({
    id: message.id,
    status: message.status,
    candidateId: parsed.data.candidateId,
    provider: "wati",
    mode: "database",
    envRequired: ["WATI_API_KEY", "WATI_BASE_URL"],
    message: "WhatsApp reminder scheduled. Connect WATI credentials in .env.local to send real messages."
  });
}
