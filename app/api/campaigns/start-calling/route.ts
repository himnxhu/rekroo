import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/prisma";
import { createTwilioCall, getAppBaseUrl, getTwilioConfig } from "@/lib/twilio";

const startCampaignSchema = z.object({
  candidateIds: z.array(z.string()).default([]),
  campaign: z.object({
    role: z.string(),
    location: z.string(),
    salary: z.string(),
    shift: z.string(),
    language: z.string(),
    maxConcurrentCalls: z.number().int().min(1).max(100)
  })
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = startCampaignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid campaign payload", details: parsed.error.flatten() },
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

  const twilioConfig = getTwilioConfig();
  if (!twilioConfig.ready) {
    return NextResponse.json(
      {
        error: "Twilio configuration is incomplete.",
        missing: twilioConfig.missing
      },
      { status: 500 }
    );
  }

  const candidates = await prisma.candidate.findMany({
    where: {
      id: { in: parsed.data.candidateIds },
      companyId: session.companyId
    },
    orderBy: { createdAt: "asc" }
  });

  if (candidates.length === 0) {
    return NextResponse.json({ error: "No callable candidates found." }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      companyId: session.companyId,
      ...parsed.data.campaign,
      status: "calling"
    }
  });

  const callLogs = await prisma.$transaction(
    candidates.map((candidate) =>
      prisma.callLog.create({
        data: {
          candidateId: candidate.id,
          campaignId: campaign.id,
          status: "queued"
        },
        include: { candidate: true }
      })
    )
  );

  await prisma.candidate.updateMany({
    where: { id: { in: candidates.map((candidate) => candidate.id) }, companyId: session.companyId },
    data: {
      status: "Calling",
      lastTouch: "Twilio call queued",
      nextAction: "Waiting for call result"
    }
  });

  const baseUrl = getAppBaseUrl(request);
  const callResults = await Promise.allSettled(
    callLogs.map(async (callLog) => {
      const twimlUrl = new URL("/api/twilio/voice", baseUrl);
      twimlUrl.searchParams.set("callLogId", callLog.id);

      const statusCallbackUrl = new URL("/api/twilio/status", baseUrl);
      statusCallbackUrl.searchParams.set("callLogId", callLog.id);

      const call = await createTwilioCall({
        to: callLog.candidate.phone,
        twimlUrl: twimlUrl.toString(),
        statusCallbackUrl: statusCallbackUrl.toString()
      });

      await prisma.callLog.update({
        where: { id: callLog.id },
        data: {
          providerCallId: call.sid,
          status: call.status || "initiated"
        }
      });

      return { callLogId: callLog.id, providerCallId: call.sid, status: call.status };
    })
  );

  const placedCalls = callResults.filter((result) => result.status === "fulfilled").length;
  const failedCalls = callResults.length - placedCalls;

  await Promise.all(
    callResults.map((result, index) => {
      if (result.status === "fulfilled") return Promise.resolve();

      return prisma.$transaction([
        prisma.callLog.update({
          where: { id: callLogs[index].id },
          data: {
            status: "failed",
            summary: result.reason instanceof Error ? result.reason.message : "Twilio call creation failed."
          }
        }),
        prisma.candidate.update({
          where: { id: callLogs[index].candidateId },
          data: {
            status: "Queued",
            lastTouch: "Twilio call failed to start",
            nextAction: "Check Twilio error and retry"
          }
        })
      ]);
    })
  );

  return NextResponse.json({
    campaignId: campaign.id,
    status: failedCalls > 0 ? "partially_started" : "calling",
    queuedCandidates: candidates.length,
    placedCalls,
    failedCalls,
    provider: "twilio",
    mode: "database",
    callbackBaseUrl: baseUrl,
    message:
      failedCalls > 0
        ? `${placedCalls} calls started and ${failedCalls} calls failed. Check call logs for Twilio errors.`
        : `${placedCalls} Twilio calls started.`
  });
}
