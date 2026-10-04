import { Suspense } from "react";
import type { Metadata } from "next";

import { TopNav } from "@/components/TopNav";
import { AssistantWorkspace } from "@/components/AssistantWorkspace";

export const metadata: Metadata = {
  title: "AI Assistant — DECODING JOBS",
  description: "Chat about real jobs and companies, and get resume ATS feedback.",
};

export default function AssistantPage() {
  return (
    // 100dvh, not 100vh. On mobile browsers 100vh is measured *with the URL bar
    // hidden*, so the real visible height is smaller and the composer and the
    // last message end up underneath the browser chrome. The h-screen class
    // stays on as the fallback for anything without dvh support. w-full, not
    // w-screen: w-screen ignores the scrollbar and can add a horizontal scroll.
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-white"
      style={{ height: "100dvh" }}
    >
      <TopNav />
      <Suspense fallback={null}>
        <AssistantWorkspace />
      </Suspense>
    </div>
  );
}
