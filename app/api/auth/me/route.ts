import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ user: null, company: null }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      id: session.userId,
      name: session.name,
      email: session.email,
      role: session.role
    },
    company: {
      id: session.companyId,
      name: session.companyName
    }
  });
}
