// Done-state rules for the admin "Finish setting up" checklist, from fields the
// shipped contract already carries. Each answers boolean | null: null means the
// backend did not say (older build, failed read) — rendered link-only and never
// counted, so a missing field reads as neither "done" nor a nag we cannot back.

import type { InstanceResponse, InstanceSettingsResponse } from "@/lib/api";

export type SetupItem = {
  title: string;
  description: string;
  href: string;
  action: string;
  external?: boolean;
  done: boolean | null;
};

export const SETUP_DISMISS_KEY = "vidra.admin-setup-dismissed";
const GENERAL = "/admin/config/general";

export function buildSetupItems(
  instance: InstanceResponse | null,
  settings: InstanceSettingsResponse | null,
): SetupItem[] {
  const find = (key: string) => settings?.settings?.find((s) => s.key === key);
  const name = find("instance_name");
  const signup = find("registration_enabled");
  const mail = instance?.features?.mail;
  const b = instance?.branding;
  const slots = b ? [b.avatar, b.banner, ...Object.values(b.logos ?? {})] : null;
  return [
    {
      title: "Name your instance",
      description: "Replace the default name shown in the header, emails and the About page.",
      href: GENERAL,
      action: "Open general settings",
      done: typeof name?.value === "string" ? name.value.trim() !== "" && name.value !== name.default : null,
    },
    {
      title: "Set up email",
      description: "Password resets, verification and report alerts need a way to send mail.",
      href: "/admin/config/email",
      action: "Open email settings",
      done: typeof mail === "boolean" ? mail : null,
    },
    {
      title: "Decide who can sign up",
      description: "Open, approval-only or closed. Until you choose, the built-in default applies.",
      href: GENERAL,
      action: "Open sign-up settings",
      done: typeof signup?.overridden === "boolean" ? signup.overridden : null,
    },
    {
      title: "Add branding",
      description: "Upload an avatar, banner or logos to replace the stock artwork.",
      href: GENERAL,
      action: "Open branding",
      done: slots ? slots.some((s) => s?.is_fallback === false) : null,
    },
    {
      // No contract field says where media lives or if backups run: guidance only.
      title: "Plan storage and backups",
      description: "Decide where media lives and how you restore it. Set at deploy time.",
      href: "https://vidra.yosef.app/docs/",
      action: "Read the docs",
      external: true,
      done: null,
    },
  ];
}

export const hasOpenWork = (items: SetupItem[]) => items.some((i) => i.done === false);
