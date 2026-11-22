import { EditSitePage } from "@/components/AdminSitePages";
export default async function EditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <EditSitePage key={slug} slug={slug} />;
}
