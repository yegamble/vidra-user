import { notFound } from "next/navigation";

import { InstanceAboutView } from "@/components/InstanceAboutView";
import { getInstanceConfig } from "@/lib/instance-config.server";
import { hideSoftwareName } from "@/lib/software-brand";

// The software's own About page. White-labelled instances answer 404 here: the
// About nav already drops the tab, but the URL is guessable and crawlable, so an
// unlinked page that still renders "This platform is powered by Vidra" would
// leak exactly what the operator switched off. A real 404 — not a redirect — is
// what tells a crawler the page does not exist.
//
// A null snapshot (backend unreachable, or the mocked e2e suite which has no
// backend at all) is NOT evidence of white-labelling, so the page renders; the
// client view then re-reads /instance itself and withholds the section if that
// read says hidden.
export default async function AboutVidraPage() {
  if (hideSoftwareName(await getInstanceConfig())) notFound();
  return <InstanceAboutView section="vidra" />;
}
