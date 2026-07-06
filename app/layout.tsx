import type { Metadata, Viewport } from "next";
import "./globals.css";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { BottomTabBar } from "@/components/BottomTabBar";
import { Header } from "@/components/Header";
import { Sidebar } from "@/components/Sidebar";
import { t } from "@/lib/i18n";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Vidra",
  description: "A federated, PeerTube-inspired video platform.",
};

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
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {/* Apply the stored theme preference before first paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <a href="#main-content" className="skip-link">
          {t("a11y.skipToContent")}
        </a>
        <AuthProvider>
          <Header />
          <div className="flex w-full flex-1">
            <Sidebar />
            <div
              id="main-content"
              tabIndex={-1}
              className="flex min-w-0 flex-1 flex-col focus:outline-none"
            >
              {children}
            </div>
          </div>
          <BottomTabBar />
        </AuthProvider>
      </body>
    </html>
  );
}
