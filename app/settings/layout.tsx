import { SettingsRail } from "@/components/settings/SettingsRail";

// The System-Settings split view (redesign, sanctioned "split-view settings"):
// a section rail (≥ lg) beside the detail pane. Below lg the rail collapses and
// the settings index becomes the grouped-rows drill-in (SettingsView). Each
// settings page keeps rendering its own single <main>, so the pair is one
// <main> landmark; the rail is a labeled secondary <nav>.
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-1">
      <SettingsRail />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
