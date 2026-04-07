import { NextResponse } from "next/server";
import { getActorSession } from "@/lib/server/mock-auth";
import { verifyStepUpChallenge } from "@/lib/server/payment-gateway";

export async function POST(request) {
  const body = await request.json().catch(() => null);

  try {
    const result = await verifyStepUpChallenge({
      actor: getActorSession(request),
      sessionId: body?.sessionId,
      clientPaymentId: body?.clientPaymentId,
      challengeId: body?.challengeId,
      code: body?.code
    });

    return NextResponse.json({
      verified: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      {
        verified: false,
        error: error.message
      },
      { status: error.status || 500 }
    );
  }
}
