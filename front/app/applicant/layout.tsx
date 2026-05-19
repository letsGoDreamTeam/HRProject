import React from "react";
import { requireRole } from "@/app/server/auth/require-role.server";
import LogoutButton from "@/components/auth/LogoutButton";

export const metadata = {
  title: "지원자",
};

export default async function ApplicantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["applicant"]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <span className="text-lg font-semibold text-slate-900">지원자</span>
        <LogoutButton />
      </header>
      <main className="mx-auto max-w-4xl p-6">{children}</main>
    </div>
  );
}