import { NextResponse } from "next/server";
import { attachActorSession, clearActorSession } from "@/lib/server/mock-auth";

export async function POST(request) {
  const body = await request.json().catch(() => null);

  if (!body?.participantId) {
    return NextResponse.json({ error: "participantId is required." }, { status: 400 });
  }

  const response = NextResponse.json({
    ok: true,
    actor: {
      participantId: body.participantId,
      participantName: body.participantName || "Unknown"
    }
  });

  attachActorSession(response, {
    participantId: body.participantId,
    participantName: body.participantName || "Unknown"
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearActorSession(response);
  return response;
}

