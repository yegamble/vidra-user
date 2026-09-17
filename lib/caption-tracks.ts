/** Metadata tracks (for example HLS ID3 cues) must never be toggled or painted as captions. */
export function captionTracks(list: TextTrackList): TextTrack[] {
  return Array.from(list).filter((track) => track.kind === "captions" || track.kind === "subtitles");
}
export function captionTrackFor(video: HTMLVideoElement, language: string): TextTrack | undefined {
  const authored = Array.from(video.querySelectorAll("track")).find((element) => element.srclang === language)?.track;
  return authored ?? captionTracks(video.textTracks).find((track) => track.language === language);
}
