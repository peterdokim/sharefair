import { NextResponse } from "next/server";
import { createExpenseSettlementRequests } from "@/lib/server/settlement-repository";

export async function POST(request, context) {
  const { tripId, expenseId } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const settlementRequests = await createExpenseSettlementRequests(tripId, expenseId, {
      dueAt: body?.dueAt
    });
    return NextResponse.json({ settlementRequests }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
