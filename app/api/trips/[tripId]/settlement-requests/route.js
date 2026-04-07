import { NextResponse } from "next/server";
import { listSettlementRequestsForTrip } from "@/lib/server/settlement-repository";

export async function GET(_request, context) {
  const { tripId } = await context.params;

  try {
    const settlementRequests = await listSettlementRequestsForTrip(tripId);
    return NextResponse.json({ settlementRequests });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
