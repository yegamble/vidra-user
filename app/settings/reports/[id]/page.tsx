import Link from "next/link";

import { PageHeader } from "@/components/PageHeader";
import { MyReportDetail } from "@/components/reports/MyReportDetail";

// One of the signed-in user's reports. The report and its thread load
// client-side in MyReportDetail; this server component resolves the id.
export default async function MyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <PageHeader
        above={
          <Link href="/settings/reports" className="focus-ring mb-4 inline-flex rounded-[10px] text-[15px] font-medium text-accent-text">
            My reports
          </Link>
        }
        title="Report"
      />
      <MyReportDetail reportId={id} />
    </main>
  );
}
