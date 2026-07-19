import { SettingsView } from "@/components/auth/SettingsView";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <SettingsView />
      {/* Appearance is a device preference, not an account setting — it lives
          outside SettingsView so signed-out visitors can use it too. */}
      <section
        aria-label="Appearance"
        className="mt-6 max-w-xl rounded-2xl border border-border-subtle bg-surface p-4"
      >
        <ThemeToggle />
      </section>
    </main>
  );
}
