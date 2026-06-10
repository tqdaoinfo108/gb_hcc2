import { NextResponse } from "next/server";
import { getQueueOverview } from "../../../lib/data";

/** Used by QueueClient to refresh data without a full page reload */
export async function GET() {
  try {
    const data = await getQueueOverview();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
