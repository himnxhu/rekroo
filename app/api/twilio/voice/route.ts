import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/twilio";

function twimlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const callLogId = url.searchParams.get("callLogId");

  const callLog = callLogId
    ? await prisma.callLog.findUnique({
        where: { id: callLogId },
        include: { candidate: true, campaign: true }
      })
    : null;

  const candidateName = callLog?.candidate.name ?? "there";
  const role = callLog?.campaign?.role ?? callLog?.candidate.role ?? "the job role";
  const location = callLog?.campaign?.location ?? callLog?.candidate.location ?? "your location";
  const salary = callLog?.campaign?.salary ?? callLog?.candidate.salary ?? "the shared salary range";

  const actionUrl = new URL("/api/twilio/gather", getAppBaseUrl(request));
  if (callLogId) {
    actionUrl.searchParams.set("callLogId", callLogId);
  }
  actionUrl.searchParams.set("step", "0");

  const question = [
    `Hi ${candidateName}. This is Rekroo calling about ${role} in ${location}.`,
    `The salary range is ${salary}.`,
    "Are you interested in this job?"
  ].join(" ");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${twimlEscape(actionUrl.toString())}" method="POST" speechTimeout="auto" timeout="5" language="en-IN">
    <Say voice="alice" language="en-IN">${twimlEscape(question)}</Say>
  </Gather>
  <Say voice="alice" language="en-IN">We did not receive a response. A recruiter will follow up. Thank you.</Say>
</Response>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "text/xml"
    }
  });
}

export async function GET(request: Request) {
  return POST(request);
}
