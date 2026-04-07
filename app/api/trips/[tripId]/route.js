import { NextResponse } from "next/server";
import { getTripById } from "@/lib/server/trip-repository";

export async function GET(_request, context) {
  const { tripId } = await context.params;

  try {
    const trip = await getTripById(tripId);

    if (!trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    return NextResponse.json({ trip });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
