"use client";

import Link from "next/link";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="pt-16">
      <h1 className="text-3xl font-medium text-parchment">
        Couldn't load that profile
      </h1>
      <p className="mt-4 max-w-prose text-parchment-dim">
        The lookup failed — the backend might be unreachable or slow to
        respond. Try again, or head back and search another name.
      </p>
      <div className="mt-6 flex gap-6">
        <button
          onClick={reset}
          className="font-mono text-sm text-brass underline underline-offset-4"
        >
          Try again
        </button>
        <Link
          href="/"
          className="font-mono text-sm text-parchment-dim underline underline-offset-4"
        >
          Back to search
        </Link>
      </div>
    </div>
  );
}
