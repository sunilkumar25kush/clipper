"use client";

import * as React from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardTopnav } from "@/components/dashboard/dashboard-topnav";
import { CreateProjectModal } from "@/components/dashboard/create-project-modal";
import { useRouter } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [createModalOpen, setCreateModalOpen] = React.useState(false);

  return (
    <ProtectedRoute>
      <div className="min-h-screen flex bg-zinc-50 dark:bg-[#131209] text-zinc-950 dark:text-zinc-50">
        <DashboardSidebar
          mobileOpen={mobileSidebarOpen}
          onCloseMobile={() => setMobileSidebarOpen(false)}
          onOpenCreateModal={() => setCreateModalOpen(true)}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <DashboardTopnav
            onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
            onOpenCreateModal={() => setCreateModalOpen(true)}
          />

          <main id="main-content" className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>

        <CreateProjectModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreated={() => {
            router.refresh();
          }}
        />
      </div>
    </ProtectedRoute>
  );
}

