import type { Metadata } from "next";

import { TopNav } from "@/components/TopNav";
import { ProfileWorkspace } from "@/components/ProfileWorkspace";

export const metadata: Metadata = {
  title: "Preferences — DECODING JOBS",
  description: "Save your target roles, cities, work mode, and skills to personalize search and chat.",
};

export default function ProfilePage() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <TopNav />
      <ProfileWorkspace />
    </div>
  );
}
