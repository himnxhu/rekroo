export type CandidateStatus =
  | "New"
  | "Queued"
  | "Calling"
  | "Interested"
  | "Callback"
  | "Not interested"
  | "Interview scheduled"
  | "Joined"
  | "Dropped";

export type Candidate = {
  id: string;
  name: string;
  phone: string;
  role: string;
  location: string;
  salary: string;
  experience: string;
  status: CandidateStatus;
  score: number;
  lastTouch: string;
  nextAction: string;
  language: "Hindi" | "English" | "Hinglish";
};

export type CampaignSettings = {
  role: string;
  location: string;
  salary: string;
  shift: string;
  language: string;
  maxConcurrentCalls: number;
};
