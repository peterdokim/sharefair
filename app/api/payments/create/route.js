import { NextResponse } from "next/server";
import { getActorSession } from "@/lib/server/mock-auth";
import { createPaymentAuthorizationSession } from "@/lib/server/payment-gateway";

export async function POST(request) {
  const body = await request.json().catch(() => null);

  try {
    const session = await createPaymentAuthorizationSession({
      actor: getActorSession(request),
      tripId: body?.tripId,
      clientPaymentId: body?.clientPaymentId,
      fromParticipantId: body?.fromParticipantId,
      toParticipantId: body?.toParticipantId,
      amount: body?.amount,
      provider: body?.provider
    });

    return NextResponse.json(session);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
