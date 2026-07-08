// DonationBadge shows whether a donation address's ownership was cryptographically
// proven. Verified is reassuring (success tint + check); unverified is neutral,
// not alarming — plenty of networks simply can't sign a message. The accessible
// name carries the meaning so it isn't colour-only.
import { CheckIcon } from "@/components/icons";
import { Badge } from "@/components/ui";

export function DonationBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <Badge
        variant="success"
        status
        title="The owner proved control of this address by signing a challenge."
      >
        <CheckIcon size={12} strokeWidth={3} />
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
