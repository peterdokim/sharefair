import { NextResponse } from "next/server";
import { markSettlementRequestSettled } from "@/lib/server/settlement-repository";

export async function PATCH(_request, context) {
  const { tripId, requestId } = await context.params;

  try {
    const settlementRequest = await markSettlementRequestSettled(tripId, requestId);
    return NextResponse.json({ settlementRequest });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
