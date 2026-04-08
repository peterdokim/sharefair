import { NextResponse } from "next/server";
import { updateSettlementRequestStatus } from "@/lib/server/settlement-repository";

export async function PATCH(request, context) {
  const { tripId, requestId } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const settlementRequest = await updateSettlementRequestStatus(tripId, requestId, body?.action);
    return NextResponse.json({ settlementRequest });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
