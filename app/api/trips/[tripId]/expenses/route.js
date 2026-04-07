import { NextResponse } from "next/server";
import { addExpenseToTrip } from "@/lib/server/trip-repository";

export async function POST(request, context) {
  const { tripId } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const trip = await addExpenseToTrip(tripId, body);
    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
