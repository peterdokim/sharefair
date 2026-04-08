import { NextResponse } from "next/server";
import { settleExpenseBill } from "@/lib/server/settlement-repository";

export async function POST(_request, context) {
  const { tripId, expenseId } = await context.params;

  try {
    const settlementRequests = await settleExpenseBill(tripId, expenseId);
    return NextResponse.json({ settlementRequests });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
