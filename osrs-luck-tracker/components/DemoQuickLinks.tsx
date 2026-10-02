import { MAX_COMPARED, nameKey, playerHref } from "@/lib/compare";
import PlayerLink from "./PlayerLink";

// The demo accounts with the most to look at, as one-click shortcuts so
// visitors can try the site without knowing a real name.
const QUICK_IGNS = ["Zezima", "Spoonfed", "Dry Bones"];

type Props =
  | { mode?: "go"; current?: string }
  | { mode: "compare"; primary: string; compared: string[] };

export default function DemoQuickLinks(props: Props) {
  const isCompare = props.mode === "compare";
  if (isCompare && props.compared.length >= MAX_COMPARED) return null;

  const taken = new Set(
    (isCompare ? [props.primary, ...props.compared] : props.current ? [props.current] : []).map(nameKey),
  );
  const igns = QUICK_IGNS.filter((ign) => !taken.has(nameKey(ign)));
  if (igns.length === 0) return null;

  return (
    <p className="mt-2 font-mono text-xs text-parchment-dim">
      {isCompare ? "add" : "try"}{" "}
      {igns.map((ign, i) => (
        <span key={ign}>
          {i > 0 && " · "}
          <PlayerLink
            href={isCompare ? playerHref(props.primary, [...props.compared, ign]) : playerHref(ign)}
            className="text-brass underline underline-offset-4"
          >
            {ign}
          </PlayerLink>
        </span>
      ))}
    </p>
  );
}
