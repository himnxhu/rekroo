import type { Candidate as PrismaCandidate } from "@prisma/client";
import type { Candidate } from "@/lib/types";

export function toCandidate(candidate: PrismaCandidate): Candidate {
  return {
    id: candidate.id,
    name: candidate.name,
    phone: candidate.phone,
    role: candidate.role,
    location: candidate.location,
    salary: candidate.salary,
    experience: candidate.experience,
    status: candidate.status as Candidate["status"],
    score: candidate.score,
    lastTouch: candidate.lastTouch,
    nextAction: candidate.nextAction,
    language: candidate.language as Candidate["language"]
  };
}
