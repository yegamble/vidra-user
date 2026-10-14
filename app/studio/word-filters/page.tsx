import { WordListsManager } from "@/components/WordListsManager";

// The Studio Word filters tab — the creator's own watched-word lists (core
// 0172). They apply to comments on this creator's videos only; a list set to
// "hold" sends matching comments to the Comment queue for approval.
export default function StudioWordFiltersPage() {
  return <WordListsManager scope="me" />;
}
