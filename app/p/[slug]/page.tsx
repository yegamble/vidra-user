import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { PageHeader } from "@/components/PageHeader";
import { getSitePage } from "@/lib/site-pages.server";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getSitePage((await params).slug);
  return page ? { title: page.title } : {};
}

export default async function SitePage({ params }: Props) {
  const page = await getSitePage((await params).slug);
  if (!page) notFound();
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <PageHeader title={page.title} />
      <Markdown>{page.body}</Markdown>
    </main>
  );
}
