import { NextResponse } from "next/server";
import { createTrip, listTrips } from "@/lib/server/trip-repository";
import { getStorageProfile } from "@/lib/server/storage-runtime";

export async function GET() {
  try {
    const trips = await listTrips();
    return NextResponse.json({
      trips,
      storage: getStorageProfile()
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => null);

  try {
    const trip = await createTrip(body);
    return NextResponse.json({ trip }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
