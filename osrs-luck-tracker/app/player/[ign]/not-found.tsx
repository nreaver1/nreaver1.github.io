import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pt-16">
      <h1 className="text-3xl font-medium text-parchment">
        No player logged under that name yet
      </h1>
      <p className="mt-4 max-w-prose text-parchment-dim">
        Either the name is misspelled, that player hasn&rsquo;t run the
        Clog Casino RuneLite plugin yet, or their log is private. Logs
        show up here once &ldquo;Show my log on the website&rdquo; is
        turned on in the plugin&rsquo;s settings.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block font-mono text-sm text-brass underline underline-offset-4"
      >
        Try another search
      </Link>
    </div>
  );
}
