import { NextResponse } from "next/server";
import { getActorSession } from "@/lib/server/mock-auth";
import { resendStepUpChallenge } from "@/lib/server/payment-gateway";

export async function POST(request) {
  const body = await request.json().catch(() => null);

  try {
    const result = await resendStepUpChallenge({
      actor: getActorSession(request),
      sessionId: body?.sessionId,
      clientPaymentId: body?.clientPaymentId
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
