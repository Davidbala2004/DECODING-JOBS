"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)" }}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/20">
        <AlertTriangle className="h-7 w-7 text-white" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Something went wrong</h1>
      <p className="max-w-sm text-sm text-gray-500">
        That was unexpected — try again, and if it keeps happening, refresh the page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-green-500/20 transition-colors hover:bg-green-700"
      >
        <RotateCw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
