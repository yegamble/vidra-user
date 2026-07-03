// DonationBadge shows whether a donation address's ownership was cryptographically
// proven. Verified is reassuring (green + check); unverified is neutral, not
// alarming — plenty of networks simply can't sign a message. The accessible name
// carries the meaning so it isn't colour-only.

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function DonationBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        title="The owner proved control of this address by signing a challenge."
      >
        <CheckIcon />
        <span>Verified</span>
        <span className="sr-only"> owner</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      title="Ownership of this address has not been cryptographically proven."
    >
      Unverified
    </span>
  );
}
