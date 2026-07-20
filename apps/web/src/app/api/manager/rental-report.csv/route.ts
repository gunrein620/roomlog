import { NextRequest, NextResponse } from "next/server";
import { getManagerRentalReport } from "@/lib/rental-report-api";
import { rentalReportCsv } from "@/lib/rental-report-csv";

export async function GET(request: NextRequest) {
  const months = request.nextUrl.searchParams.get("months");
  if (months !== "6" && months !== "12") {
    return NextResponse.json({ message: "months는 6 또는 12여야 합니다." }, { status: 400 });
  }

  try {
    const report = await getManagerRentalReport(months === "6" ? 6 : 12);
    return new Response(rentalReportCsv(report), {
      headers: {
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`임대현황리포트-${months}개월.csv`)}`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch {
    return NextResponse.json({ message: "임대 현황 리포트를 내보내지 못했습니다." }, { status: 502 });
  }
}
