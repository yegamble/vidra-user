// DonationBadge shows whether a donation address's ownership was cryptographically
// proven. Verified is reassuring (success tint + check); unverified is neutral,
// not alarming — plenty of networks simply can't sign a message. The accessible
// name carries the meaning so it isn't colour-only.
import { Badge } from "@/components/ui";

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
      <Badge
        variant="success"
        status
        title="The owner proved control of this address by signing a challenge."
      >
        <CheckIcon />
        <span>Verified</span>
        <span className="sr-only"> owner</span>
      </Badge>
    );
  }
  return (
    <Badge
      variant="strong"
      status
      title="Ownership of this address has not been cryptographically proven."
    >
      Unverified
    </Badge>
  );
}
