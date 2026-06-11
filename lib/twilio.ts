type TwilioCallInput = {
  to: string;
  twimlUrl: string;
  statusCallbackUrl: string;
};

type TwilioCallResult = {
  sid: string;
  status: string;
};

export function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const phoneNumber = normalizePhoneNumber(process.env.TWILIO_PHONE_NUMBER ?? "");

  const missing = [
    !accountSid ? "TWILIO_ACCOUNT_SID" : null,
    !authToken ? "TWILIO_AUTH_TOKEN" : null,
    !phoneNumber ? "TWILIO_PHONE_NUMBER" : null
  ].filter((item): item is string => Boolean(item));

  return {
    accountSid,
    authToken,
    phoneNumber,
    missing,
    ready: missing.length === 0
  };
}

export function normalizePhoneNumber(phone: string) {
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith("91")) return `+${cleaned}`;
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

export function getAppBaseUrl(request: Request) {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;

  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

export async function createTwilioCall(input: TwilioCallInput): Promise<TwilioCallResult> {
  const config = getTwilioConfig();
  if (!config.ready || !config.accountSid || !config.authToken || !config.phoneNumber) {
    throw new Error(`Missing Twilio configuration: ${config.missing.join(", ")}`);
  }

  const body = new URLSearchParams({
    To: normalizePhoneNumber(input.to),
    From: config.phoneNumber,
    Url: input.twimlUrl,
    Method: "POST",
    StatusCallback: input.statusCallbackUrl,
    StatusCallbackMethod: "POST",
    StatusCallbackEvent: "initiated ringing answered completed"
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message ?? "Twilio call creation failed.");
  }

  return {
    sid: data.sid,
    status: data.status
  };
}
