import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const finalStatuses = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);

export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData();
  const callLogId = String(form.get("callLogId") ?? url.searchParams.get("callLogId") ?? "");
  const callSid = String(form.get("CallSid") ?? "");
  const callStatus = String(form.get("CallStatus") ?? "unknown");
  const duration = Number(form.get("CallDuration") ?? 0);

  if (!callLogId) {
    return NextResponse.json({ error: "Missing callLogId" }, { status: 400 });
  }

  const callLog = await prisma.callLog.findUnique({
    where: { id: callLogId },
    include: { candidate: true }
  });

  if (!callLog) {
    return NextResponse.json({ error: "Call log not found" }, { status: 404 });
  }

  const summary =
    finalStatuses.has(callStatus) && !callLog.summary
      ? `Twilio call ${callStatus}${duration > 0 ? ` after ${duration} seconds` : ""}`
      : callLog.summary;

  await prisma.callLog.update({
    where: { id: callLogId },
    data: {
      providerCallId: callSid || callLog.providerCallId,
      status: callStatus,
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : callLog.durationSec,
      summary
    }
  });

  if (finalStatuses.has(callStatus) && callLog.status !== "completed") {
    await prisma.candidate.update({
      where: { id: callLog.candidateId },
      data: {
        status: callStatus === "completed" ? "Callback" : "Queued",
        lastTouch: `Twilio call ${callStatus}`,
        nextAction: callStatus === "completed" ? "Recruiter review needed" : "Retry call"
      }
    });
  }

  return NextResponse.json({ ok: true });
}
