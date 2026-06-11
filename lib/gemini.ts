import type { CandidateStatus } from "@/lib/types";

export type CallClassification = {
  status: CandidateStatus;
  score: number;
  nextAction: string;
  summary: string;
};

type ClassifyInput = {
  candidate: {
    name: string;
    phone: string;
    role: string;
    location: string;
    salary: string;
    experience: string;
  };
  campaign: {
    role: string;
    location: string;
    salary: string;
    shift: string;
    language: string;
  } | null;
  transcript: string;
};

const allowedStatuses: CandidateStatus[] = [
  "Interested",
  "Callback",
  "Not interested",
  "Interview scheduled",
  "Dropped"
];

export async function classifyCall(input: ClassifyInput): Promise<CallClassification> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return fallbackClassify(input.transcript);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "Classify this recruitment screening call.",
                    "Return only valid JSON with keys: status, score, nextAction, summary.",
                    `Allowed statuses: ${allowedStatuses.join(", ")}.`,
                    "Score must be an integer from 0 to 100.",
                    `Candidate: ${JSON.stringify(input.candidate)}`,
                    `Campaign: ${JSON.stringify(input.campaign)}`,
                    `Transcript:\n${input.transcript}`
                  ].join("\n")
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message ?? "Gemini classification failed.");
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(text) as Partial<CallClassification>;
    return normalizeClassification(parsed, input.transcript);
  } catch {
    return fallbackClassify(input.transcript);
  }
}

function normalizeClassification(
  parsed: Partial<CallClassification>,
  transcript: string
): CallClassification {
  const status = allowedStatuses.includes(parsed.status as CandidateStatus)
    ? (parsed.status as CandidateStatus)
    : fallbackClassify(transcript).status;

  const score = Number.isInteger(parsed.score) ? Math.max(0, Math.min(100, Number(parsed.score))) : fallbackClassify(transcript).score;

  return {
    status,
    score,
    nextAction: parsed.nextAction?.trim() || defaultNextAction(status),
    summary: parsed.summary?.trim() || `AI call completed: ${status}`
  };
}

function fallbackClassify(transcript: string): CallClassification {
  const text = transcript.toLowerCase();
  const negative = ["not interested", "no ", "nahi", "mat", "reject", "not looking"].some((term) => text.includes(term));
  const callback = ["later", "callback", "call me", "busy", "tomorrow", "evening", "baad"].some((term) => text.includes(term));
  const interview = ["interview", "available", "schedule", "come", "attend"].some((term) => text.includes(term));
  const positive = ["yes", "interested", "okay", "ok", "ready", "haan"].some((term) => text.includes(term));

  if (negative) {
    return {
      status: "Not interested",
      score: 20,
      nextAction: "No action",
      summary: "AI call completed: candidate not interested"
    };
  }

  if (interview && positive) {
    return {
      status: "Interview scheduled",
      score: 88,
      nextAction: "Recruiter to confirm interview slot",
      summary: "AI call completed: candidate is ready for interview scheduling"
    };
  }

  if (callback) {
    return {
      status: "Callback",
      score: 62,
      nextAction: "Schedule callback",
      summary: "AI call completed: callback requested"
    };
  }

  if (positive) {
    return {
      status: "Interested",
      score: 82,
      nextAction: "Recruiter review needed",
      summary: "AI call completed: candidate interested"
    };
  }

  return {
    status: "Callback",
    score: 50,
    nextAction: "Recruiter review needed",
    summary: "AI call completed: unclear response"
  };
}

function defaultNextAction(status: CandidateStatus) {
  if (status === "Interested") return "Recruiter review needed";
  if (status === "Callback") return "Schedule callback";
  if (status === "Interview scheduled") return "Recruiter to confirm interview slot";
  if (status === "Not interested" || status === "Dropped") return "No action";
  return "Recruiter review needed";
}
