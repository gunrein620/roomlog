import { NextResponse } from "next/server";
import { getManagerHomeSummary } from "@/lib/manager-home-api";
import { getUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "LANDLORD") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const summary = await getManagerHomeSummary(user);
  return NextResponse.json(summary);
}
