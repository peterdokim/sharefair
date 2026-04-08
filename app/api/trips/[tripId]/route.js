import { NextResponse } from "next/server";
import { deleteTrip, getTripById, updateTrip } from "@/lib/server/trip-repository";

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

export async function DELETE(_request, context) {
  const { tripId } = await context.params;

  try {
    const trip = await deleteTrip(tripId);
    return NextResponse.json({ trip });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function PATCH(request, context) {
  const { tripId } = await context.params;
  const body = await request.json().catch(() => null);

  try {
    const trip = await updateTrip(tripId, body);
    return NextResponse.json({ trip });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
