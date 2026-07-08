import { AdminConsole } from "@/components/AdminConsole";

// The desktop admin console shell (design refresh DR12): a 230px sidebar rail
// (AdminConsole) beside the admin page content. The rail is desktop-only
// (`lg:`); below that it collapses to nothing and the horizontal AdminTabs on
// each page carry the section nav. For admins, the global app Sidebar hides
// itself on /admin routes (see components/Sidebar.tsx) so the console is the
// single left rail — matching the design's standalone console.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-1">
      <AdminConsole />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
