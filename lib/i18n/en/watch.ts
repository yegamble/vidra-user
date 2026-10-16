export const watch = {
  // Watch page (WatchView and its direct children).
  "watch.loading": "Loading video…",
  "watch.notFound.title": "Video not found",
  "watch.notFound.message": "This video does not exist, or it is private.",
  "watch.signIn.title": "Sign in to watch this video",
  "watch.signIn.body": "— it is only visible to people signed in to this instance.",
  "watch.error.load": "Could not load this video.",
  "watch.restricted.title": "Unavailable in Restricted Mode",
  "watch.restricted.message": "Turn off Restricted Mode from your account menu to view sensitive content.",
  "watch.playlist.error": "Could not load this playlist. Playback continuation is unavailable.",
  "watch.meta.views": "{count} views",
  // Trailing space is deliberate: the label is a screen-reader prefix to the chip text.
  "watch.chip.category": "Category: ",
  "watch.chip.language": "Language: ",
  "watch.chip.license": "License: ",
  "watch.tags.label": "Tags",
  "watch.tags.browse": "Browse videos tagged {tag}",
  "watch.thisCreator": "this creator",
  "watch.actions.label": "Video actions",
  "watch.channel.followers": "{count} followers",
  // Comments section: header and list states.
  "watch.comments.label": "Comments",
  "watch.comments.heading": "Comments ({total})",
  "watch.comments.off": "Comments are turned off for this video.",
  "watch.comments.loading": "Loading comments",
  "watch.comments.error": "Could not load comments.",
  "watch.comments.empty": "No comments yet. Be the first to comment.",
  "watch.comments.moreError": "Could not load more comments.",
  // Like/dislike control.
  "watch.rating.federationOff": "Federation is turned off on this instance, so federated videos cannot be rated.",
  "watch.rating.rateLimited": "You are rating too quickly. Try again in a minute.",
  "watch.remote.note": "This is a federated video from {domain}. Saving lives on the origin instance. Likes and dislikes are sent on to {domain}, which keeps the counts. You can reply here: your comment is hosted on this instance and sent on to {domain}. The \u201cComments from the origin\u201d below are a copy of the origin\u2019s own thread, sent here. Reports go to the moderators of this instance.",
} as const;
