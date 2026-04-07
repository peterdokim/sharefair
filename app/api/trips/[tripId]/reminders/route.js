import { NextResponse } from "next/server";
import { markTripRemindersSent } from "@/lib/server/trip-repository";

export async function POST(_request, context) {
  const { tripId } = await context.params;

  try {
    const trip = await markTripRemindersSent(tripId);
    return NextResponse.json({ trip });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
