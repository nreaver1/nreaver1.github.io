// An item's inventory sprite, linking to the item's page on the OSRS Wiki.
// Both are looked up by item id, so they work for any item without a
// name -> page mapping: RuneLite serves every item's icon from the game
// cache, and the wiki's Special:Lookup redirects an id to its page.

export function itemIconUrl(itemId: number) {
  return `https://static.runelite.net/cache/item/icon/${itemId}.png`;
}

export function itemWikiUrl(itemId: number) {
  return `https://oldschool.runescape.wiki/w/Special:Lookup?type=item&id=${itemId}`;
}

export default function ItemIcon({
  itemId,
  name,
  size = "md",
}: {
  itemId: number;
  name: string;
  size?: "sm" | "md" | "lg";
}) {
  // Sprites are at most 36x32. They're shown at native size where they fit
  // (scaling pixel art by a fraction blurs it) and shrunk only in "sm".
  const box = { sm: "h-7 w-7", md: "h-10 w-10", lg: "h-12 w-12" }[size];
  const max = { sm: 22, md: 36, lg: 36 }[size];
  return (
    <a
      href={itemWikiUrl(itemId)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${name} on the OSRS Wiki`}
      aria-label={`${name} on the OSRS Wiki (opens in a new tab)`}
      className={`inline-flex shrink-0 items-center justify-center border border-panel-border bg-ink/60 transition-colors hover:border-brass hover:bg-brass/10 ${box}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny remote sprites; next/image adds nothing here */}
      <img
        src={itemIconUrl(itemId)}
        alt=""
        loading="lazy"
        className="object-contain"
        style={{ maxWidth: max, maxHeight: max }}
      />
    </a>
  );
}
