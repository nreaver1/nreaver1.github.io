// A drop source's name, linking to its page on the OSRS Wiki. Sources are
// collection log page names; most are a wiki title or redirect, and the
// rest are mapped here. It looks like the text around it until hovered.

// Log pages with no wiki page or redirect of the same name.
const WIKI_PAGE: Record<string, string> = {
  "Barrows Chests": "Barrows",
  "Callisto and Artio": "Callisto",
  "The Fight Caves": "TzHaar Fight Cave",
  "Venenatis and Spindel": "Venenatis",
  "Vet'ion and Calvar'ion": "Vet'ion",
};

export function sourceWikiUrl(source: string) {
  const page = (WIKI_PAGE[source] ?? source).replace(/ /g, "_");
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent(page)}`;
}

export default function SourceLink({ source }: { source: string }) {
  return (
    <a
      href={sourceWikiUrl(source)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${source} on the OSRS Wiki`}
      className="underline-offset-2 transition-colors hover:text-brass hover:underline"
    >
      {source}
    </a>
  );
}
