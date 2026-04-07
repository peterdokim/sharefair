import { NextResponse } from "next/server";
import { listSettlementRequestsForExpense } from "@/lib/server/settlement-repository";

export async function GET(_request, context) {
  const { tripId, expenseId } = await context.params;

  try {
    const settlementRequests = await listSettlementRequestsForExpense(tripId, expenseId);
    return NextResponse.json({ settlementRequests });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
