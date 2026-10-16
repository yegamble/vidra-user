import { CommentsQueueView } from "@/components/studio/CommentsQueueView";

// The Studio Comments tab — the review queue for comments on every video the
// creator manages (core 0161). CommentsQueueView carries its own Suspense
// boundary (ListBoundary) for the URL-held list state.
export default function StudioCommentsPage() {
  return <CommentsQueueView />;
}
