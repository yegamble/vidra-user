import type { Metadata, Viewport } from "next";
import "./globals.css";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { BottomTabBar } from "@/components/BottomTabBar";
import { Header } from "@/components/Header";
import { InstanceBanner } from "@/components/InstanceBanner";
import { InstanceCustomization } from "@/components/InstanceCustomization";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/ui";
import { t } from "@/lib/i18n";
import { getInstanceConfig } from "@/lib/instance-config.server";
import { buildRootMetadata } from "@/lib/layout-metadata";
import { buildThemeBootstrapScript } from "@/lib/theme-bootstrap";

// Config-parity W2: this layout is a fixed set of extension SEAMS wired to the
// server-side instance-config snapshot (lib/instance-config.server.ts, null
// when the backend is unreachable — every seam then falls back to today's
// hardcoded behavior). Later waves extend the seam modules, never this file:
//   - metadata        → lib/layout-metadata.ts (W4 branding/social)
//   - banner slot     → components/InstanceBanner.tsx (W3 broadcast)
//   - header branding → components/Header.tsx (W4 logos + hide_instance_name)
//   - theme bootstrap → lib/theme-bootstrap.ts (W5 default_theme)
//   - CSS/JS inject   → components/InstanceCustomization.tsx (W6 documents)

export async function generateMetadata(): Promise<Metadata> {
  return buildRootMetadata(await getInstanceConfig());
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Extend under the home indicator so the bottom tab bar can own the
  // safe-area inset (it pads itself with env(safe-area-inset-bottom)).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

// Typography is the Apple-HIG system stack (see --font-sans in globals.css):
// SF Pro on Apple platforms, the native UI face elsewhere — no webfont
// download. suppressHydrationWarning covers the data-theme attribute the
// bootstrap script may set before React hydrates.
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const instance = await getInstanceConfig();
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {/* Apply the stored theme preference (or, failing that, the instance
            default from the SSR snapshot) before first paint — no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: buildThemeBootstrapScript(instance?.defaults?.theme),
          }}
        />
        <InstanceCustomization instance={instance} />
        <a href="#main-content" className="skip-link">
          {t("a11y.skipToContent")}
        </a>
        <AuthProvider>
          <ToastProvider>
            <InstanceBanner instance={instance} />
            <Header instance={instance} />
            <div className="flex w-full flex-1">
              <Sidebar />
              <div
                id="main-content"
                tabIndex={-1}
                className="flex min-h-0 min-w-0 flex-1 flex-col focus:outline-none"
              >
                {children}
              </div>
            </div>
            <BottomTabBar />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
