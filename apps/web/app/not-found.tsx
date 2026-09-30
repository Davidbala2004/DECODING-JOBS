import Link from "next/link";
import { MapPinOff } from "lucide-react";

export default function NotFound() {
  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center gap-4 px-6 text-center"
      style={{ background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)" }}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/20">
        <MapPinOff className="h-7 w-7 text-white" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">This pin doesn&apos;t exist</h1>
      <p className="max-w-sm text-sm text-gray-500">
        The page you&apos;re looking for was moved, renamed, or never existed. Let&apos;s get you back on the map.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-green-500/20 transition-colors hover:bg-green-700"
      >
        Back to the map
      </Link>
    </div>
  );
}
