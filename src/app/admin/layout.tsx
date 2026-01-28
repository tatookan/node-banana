import { ReactNode } from "react";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-900">
      {/* Admin Header */}
      <header className="h-14 bg-neutral-800 border-b border-neutral-700 flex items-center px-6">
        <h1 className="text-xl font-semibold text-white">管理后台</h1>
      </header>
      {children}
    </div>
  );
}
