import java.io.File;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import net.runelite.cache.ConfigType;
import net.runelite.cache.IndexType;
import net.runelite.cache.ItemManager;
import net.runelite.cache.definitions.EnumDefinition;
import net.runelite.cache.definitions.ItemDefinition;
import net.runelite.cache.definitions.StructDefinition;
import net.runelite.cache.definitions.loaders.EnumLoader;
import net.runelite.cache.definitions.loaders.StructLoader;
import net.runelite.cache.fs.Archive;
import net.runelite.cache.fs.FSFile;
import net.runelite.cache.fs.Index;
import net.runelite.cache.fs.Storage;
import net.runelite.cache.fs.Store;

/**
 * Dumps the collection log layout (tab -> page -> item ids) from a local
 * OSRS game cache to JSON. Reads the same structs and enums as the plugin's
 * CollectionLogIndex, so the ids match what the plugin sees in game.
 *
 * Usage: gradlew -p scripts/clog-dump run --args="<jagexcache/oldschool/LIVE> <out.json>"
 */
public class ClogDump
{
	// Same ids as CollectionLogIndex: Bosses, Raids, Clues, Minigames, Other
	private static final int[] TAB_STRUCT_IDS = {471, 472, 473, 474, 475};
	private static final String[] TAB_NAMES = {"Bosses", "Raids", "Clues", "Minigames", "Other"};
	private static final int TAB_PAGES_ENUM_PARAM = 683;
	private static final int PAGE_NAME_PARAM = 689;
	private static final int PAGE_ITEMS_ENUM_PARAM = 690;

	public static void main(String[] args) throws Exception
	{
		Store store = new Store(new File(args[0]));
		store.load();
		Storage storage = store.getStorage();
		Index configs = store.getIndex(IndexType.CONFIGS);

		Map<Integer, StructDefinition> structs = new HashMap<>();
		Archive structArchive = configs.getArchive(ConfigType.STRUCT.getId());
		for (FSFile f : structArchive.getFiles(storage.loadArchive(structArchive)).getFiles())
		{
			structs.put(f.getFileId(), new StructLoader().load(f.getFileId(), f.getContents()));
		}
		Map<Integer, EnumDefinition> enums = new HashMap<>();
		Archive enumArchive = configs.getArchive(ConfigType.ENUM.getId());
		for (FSFile f : enumArchive.getFiles(storage.loadArchive(enumArchive)).getFiles())
		{
			enums.put(f.getFileId(), new EnumLoader().load(f.getFileId(), f.getContents()));
		}
		ItemManager items = new ItemManager(store);
		items.load();

		try (PrintWriter out = new PrintWriter(new File(args[1]), StandardCharsets.UTF_8))
		{
			out.println("{");
			out.println("  \"_about\": \"Collection log layout dumped from the game cache by scripts/clog-dump. Page names and item ids are exactly what the plugin's CollectionLogIndex reads.\",");
			out.println("  \"pages\": [");
			boolean firstPage = true;
			for (int t = 0; t < TAB_STRUCT_IDS.length; t++)
			{
				StructDefinition tab = structs.get(TAB_STRUCT_IDS[t]);
				EnumDefinition pages = enums.get((Integer) tab.getParams().get(TAB_PAGES_ENUM_PARAM));
				for (int pageStructId : pages.getIntVals())
				{
					StructDefinition page = structs.get(pageStructId);
					String name = (String) page.getParams().get(PAGE_NAME_PARAM);
					int[] ids = enums.get((Integer) page.getParams().get(PAGE_ITEMS_ENUM_PARAM)).getIntVals();

					out.print(firstPage ? "" : ",\n");
					firstPage = false;
					out.print("    {\"tab\": \"" + TAB_NAMES[t] + "\", \"page\": " + quote(name) + ", \"items\": [");
					for (int i = 0; i < ids.length; i++)
					{
						ItemDefinition item = items.getItem(ids[i]);
						out.print((i == 0 ? "\n" : ",\n") + "      {\"id\": " + ids[i] + ", \"name\": "
							+ quote(item == null ? "" : item.getName()) + "}");
					}
					out.print("\n    ]}");
				}
			}
			out.println("\n  ]");
			out.println("}");
		}
	}

	private static String quote(String s)
	{
		return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
	}
}
