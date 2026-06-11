import { classifyCall } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/twilio";

const questions = [
  "What is your current or expected monthly salary?",
  "What is your highest qualification and total work experience?",
  "Are you comfortable with this shift and location?",
  "When can you attend an interview, or do you want a callback?",
  "Thank you. Please share any final note for the recruiter."
];

function twimlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function twiml(xml: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, {
    headers: { "Content-Type": "text/xml" }
  });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData();
  const callLogId = String(url.searchParams.get("callLogId") ?? "");
  const step = Number(url.searchParams.get("step") ?? 0);
  const speech = String(form.get("SpeechResult") ?? "").trim();

  if (!callLogId) {
    return twiml("<Response><Say voice=\"alice\" language=\"en-IN\">Call context is missing. A recruiter will follow up.</Say></Response>");
  }

  const callLog = await prisma.callLog.findUnique({
    where: { id: callLogId },
    include: { candidate: true, campaign: true }
  });

  if (!callLog) {
    return twiml("<Response><Say voice=\"alice\" language=\"en-IN\">Call record was not found. A recruiter will follow up.</Say></Response>");
  }

  const previousTranscript = callLog.transcript?.trim() ?? "";
  const answeredQuestion =
    step === 0
      ? "Are you interested in this job?"
      : questions[Math.max(0, step - 1)] ?? "Follow-up question";
  const nextTranscript = [
    previousTranscript,
    `AI: ${answeredQuestion}`,
    `Candidate: ${speech || "[no response captured]"}`
  ]
    .filter(Boolean)
    .join("\n");

  await prisma.callLog.update({
    where: { id: callLogId },
    data: {
      status: "in-progress",
      transcript: nextTranscript
    }
  });

  if (step < questions.length) {
    const actionUrl = new URL("/api/twilio/gather", getAppBaseUrl(request));
    actionUrl.searchParams.set("callLogId", callLogId);
    actionUrl.searchParams.set("step", String(step + 1));

    return twiml(`<Response>
  <Gather input="speech" action="${twimlEscape(actionUrl.toString())}" method="POST" speechTimeout="auto" timeout="5" language="en-IN">
    <Say voice="alice" language="en-IN">${twimlEscape(questions[step])}</Say>
  </Gather>
  <Say voice="alice" language="en-IN">We did not receive a response. A recruiter will review and follow up. Thank you.</Say>
</Response>`);
  }

  const result = await classifyCall({
    candidate: {
      name: callLog.candidate.name,
      phone: callLog.candidate.phone,
      role: callLog.candidate.role,
      location: callLog.candidate.location,
      salary: callLog.candidate.salary,
      experience: callLog.candidate.experience
    },
    campaign: callLog.campaign
      ? {
          role: callLog.campaign.role,
          location: callLog.campaign.location,
          salary: callLog.campaign.salary,
          shift: callLog.campaign.shift,
          language: callLog.campaign.language
        }
      : null,
    transcript: nextTranscript
  });

  await prisma.$transaction([
    prisma.callLog.update({
      where: { id: callLogId },
      data: {
        status: "completed",
        transcript: nextTranscript,
        summary: result.summary
      }
    }),
    prisma.candidate.update({
      where: { id: callLog.candidateId },
      data: {
        status: result.status,
        score: result.score,
        lastTouch: result.summary,
        nextAction: result.nextAction
      }
    })
  ]);

  return twiml(`<Response>
  <Say voice="alice" language="en-IN">Thank you ${twimlEscape(callLog.candidate.name)}. Our recruiter will review your response and follow up with the next step. Goodbye.</Say>
</Response>`);
}
