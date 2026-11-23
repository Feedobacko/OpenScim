package openscim.doomobserver;

import com.google.gson.Gson;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.TreeSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Actor;
import net.runelite.api.ActorSpotAnim;
import net.runelite.api.ChatMessageType;
import net.runelite.api.Client;
import net.runelite.api.GameState;
import net.runelite.api.GameObject;
import net.runelite.api.GraphicsObject;
import net.runelite.api.Hitsplat;
import net.runelite.api.Item;
import net.runelite.api.MenuEntry;
import net.runelite.api.NPC;
import net.runelite.api.NPCComposition;
import net.runelite.api.Perspective;
import net.runelite.api.Point;
import net.runelite.api.SpritePixels;
import net.runelite.api.Player;
import net.runelite.api.Prayer;
import net.runelite.api.Projectile;
import net.runelite.api.Skill;
import net.runelite.api.WorldView;
import net.runelite.api.coords.LocalPoint;
import net.runelite.api.coords.WorldPoint;
import net.runelite.api.events.ActorDeath;
import net.runelite.api.events.AnimationChanged;
import net.runelite.api.events.AreaSoundEffectPlayed;
import net.runelite.api.events.ChatMessage;
import net.runelite.api.events.ClientTick;
import net.runelite.api.events.DecorativeObjectDespawned;
import net.runelite.api.events.DecorativeObjectSpawned;
import net.runelite.api.events.GameObjectDespawned;
import net.runelite.api.events.GameObjectSpawned;
import net.runelite.api.events.GameStateChanged;
import net.runelite.api.events.GameTick;
import net.runelite.api.events.GraphicChanged;
import net.runelite.api.events.GraphicsObjectCreated;
import net.runelite.api.events.GroundObjectDespawned;
import net.runelite.api.events.GroundObjectSpawned;
import net.runelite.api.events.HitsplatApplied;
import net.runelite.api.events.InteractingChanged;
import net.runelite.api.events.ItemContainerChanged;
import net.runelite.api.events.MenuOptionClicked;
import net.runelite.api.events.NpcChanged;
import net.runelite.api.events.NpcDespawned;
import net.runelite.api.events.NpcSpawned;
import net.runelite.api.events.OverheadTextChanged;
import net.runelite.api.events.PostHealthBarConfig;
import net.runelite.api.events.ProjectileMoved;
import net.runelite.api.events.SoundEffectPlayed;
import net.runelite.api.events.StatChanged;
import net.runelite.api.events.VarbitChanged;
import net.runelite.api.events.WallObjectDespawned;
import net.runelite.api.events.WallObjectSpawned;
import net.runelite.api.events.WidgetClosed;
import net.runelite.api.events.WidgetLoaded;
import net.runelite.api.widgets.Widget;
import net.runelite.client.RuneLite;
import net.runelite.client.eventbus.Subscribe;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.DrawManager;
import net.runelite.client.util.ImageUtil;

/**
 * Writes down what the game client is told at the Doom of Mokhaiotl: one JSON
 * object per line in ~/.runelite/doom-observer/doom-&lt;time&gt;.jsonl. A copy
 * of the Vardorvis Observer (tools/vardorvis-observer), itself a copy of the
 * Colosseum Observer, with the Doom's own parts put in.
 *
 * It only listens. It draws nothing, plays nothing, adds no menu entry, sends
 * no input and no network request, and changes nothing in the client: every
 * call it makes on the RuneLite API is a getter. Nothing about other players
 * is written, and the player's own name is replaced in chat lines and menu
 * targets. The inventory and the worn equipment are not written.
 *
 * What is written: every tick the player and every NPC (tile, animation,
 * facing, target, health, spot animations, and an NPC's overhead prayer
 * icons: the larvae's); NPCs appearing, leaving and changing form (the Doom,
 * shielded and burrowed, the larvae, volatile earth, the earthen shield);
 * animations and spot animations as they start; every projectile (orbs,
 * rocks and their pieces, acid, the beam); graphics on the ground (debris,
 * shadows, the slam, the eye); hitsplats; the game's chat lines; sounds; the
 * player's own clicks; every interface that opens, widget by widget (the boss
 * bar, the reward screen, the scoreboard); objects of the scene (rocks, acid
 * pools, the burrow hole); item containers other than the player's own (the
 * loot); the delve's variables whenever one changes; and, every time the
 * scene is loaded, which map squares the instance is built from: each delve
 * can be another map.
 *
 * Every line has "e" (what it is), "t" (the game tick, counted by the client
 * since login), "c" (the client cycle, 20 ms each, 30 to a tick) and "ct" (the
 * cycles since this tick's GameTick event). A tile is {x, y, plane} within the
 * map square the instance was copied from, south-west first, which is the form
 * client/encounters/doom-of-mokhaiotl/ uses; "region" names that square when
 * it is not delve 1's (20,149), and "raw" is the scene's own coordinate when
 * the two differ.
 */
@Slf4j
@PluginDescriptor(
	name = "Doom Observer",
	description = "Records what the game shows at the Doom of Mokhaiotl to a file. Draws nothing, sends nothing.",
	tags = {"doom", "mokhaiotl", "delve", "log", "timing"}
)
public class DoomObserverPlugin extends Plugin
{
	// The Ruins of Mokhaiotl: the lobby and delve 1's arena (map square 20,149). The TSPS project's
	// captures (github.com/RSPSApp/tsps, docs/doom-of-mokhaiotl.md) have delves 2+ copied from 53,100;
	// deeper delves may use others, so the observer also starts wherever one of the Doom's NPCs is.
	private static final int RUINS_REGION = 20 << 8 | 149;
	private static final Set<Integer> DOOM_REGIONS = Set.of(RUINS_REGION, 53 << 8 | 100);
	// The Doom (14707), shielded (14708), burrowed (14709), the larvae (14710-14713), volatile earth
	// (14714), the earthen shield (14715) and the giant larvae (14788, 14789).
	private static final Set<Integer> DOOM_NPCS = Set.of(14707, 14708, 14709, 14710, 14711, 14712, 14713, 14714, 14715, 14788, 14789);
	// The delve's variables, from the TSPS captures: the surfacing cycle (4805), the level, 0-based
	// (4828, 4798), the delve's and the run's ticks (4804, 4803), the completions (4807-4816), the
	// boss bar's NPC (1683); varbits: the larva charge (17758), the boss bar's hitpoints (6099, 6100)
	// and its switch (12401), The Final Dawn (16663).
	private static final int[] DOOM_VARPS = {4798, 4803, 4804, 4805, 4807, 4808, 4809, 4810, 4811, 4812, 4813, 4814, 4815, 4816, 4828, 1683};
	private static final int[] DOOM_VARBITS = {17758, 6099, 6100, 12401, 16663};
	// Run switched on.
	private static final int RUN_VARP = 173;
	// The burrowed Doom: his zooms are glides between ticks, written down frame by frame.
	private static final int BURROWED_DOOM = 14709;
	private static final Prayer[] PRAYERS = Prayer.values();

	@Inject
	private Client client;

	@Inject
	private Gson gson;

	@Inject
	private DrawManager drawManager;

	// The interfaces written down on coming in: the minimap's orbs (hitpoints, prayer, run, special
	// attack) and the boss bar, whose sizes the simulator's interface is to match.
	private static final int[] INTERFACES_ON_ENTER = {160, 303};
	// The box cropped from the drawn frame around a bar's anchor, in canvas pixels: across either side,
	// up and down. Up reaches the overhead prayers above the bars; down stops above a player's head.
	private static final int CROP_ACROSS = 80, CROP_UP = 110, CROP_DOWN = 12;

	private BufferedWriter out;
	private Path file;
	private boolean inside;
	private int tickCycle;
	// Where each burrowed Doom was last drawn, so that a frame is written only when he moved or turned.
	private final Map<Integer, String> lastBurrowFrame = new HashMap<>();
	// The projectiles already written down, with the cycle each ends on.
	private final Map<Projectile, Integer> seenProjectiles = new IdentityHashMap<>();
	// Each projectile written down, with the number it is known by in "projectile_flight" lines.
	private final Map<Projectile, Integer> projectileNumbers = new IdentityHashMap<>();
	private int nextProjectileNumber;
	// The interfaces to write down, by group id, with the tick each loaded on:
	// an interface is filled by client scripts after it has loaded.
	private final Map<Integer, Integer> interfacesToDump = new HashMap<>();
	// The player's own item containers, which are not written: the inventory and the worn equipment.
	private static final int INVENTORY_CONTAINER = 93;
	private static final int EQUIPMENT_CONTAINER = 94;

	@Override
	protected void startUp()
	{
		inside = false;
		seenProjectiles.clear();
		projectileNumbers.clear();
		interfacesToDump.clear();
	}

	@Override
	protected void shutDown()
	{
		close();
	}

	// ------------------------------------------------------------------ output

	private void open() throws IOException
	{
		Path directory = RuneLite.RUNELITE_DIR.toPath().resolve("doom-observer");
		Files.createDirectories(directory);
		file = directory.resolve("doom-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + ".jsonl");
		out = Files.newBufferedWriter(file, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
		log.info("Doom Observer: writing to {}", file);
	}

	private void close()
	{
		if (out != null)
		{
			try
			{
				out.close();
			}
			catch (IOException e)
			{
				log.warn("Doom Observer: closing {}", file, e);
			}
			out = null;
		}
	}

	/** One line: the event's name, the clocks, then the pairs of `fields`. Nothing is written away from the Doom. */
	private void emit(String event, Object... fields)
	{
		if (!inside)
		{
			return;
		}
		Map<String, Object> line = new LinkedHashMap<>();
		line.put("e", event);
		line.put("t", client.getTickCount());
		line.put("c", client.getGameCycle());
		line.put("ct", client.getGameCycle() - tickCycle);
		for (int i = 0; i + 1 < fields.length; i += 2)
		{
			if (fields[i + 1] != null)
			{
				line.put((String) fields[i], fields[i + 1]);
			}
		}
		try
		{
			if (out == null)
			{
				open();
			}
			out.write(gson.toJson(line));
			out.newLine();
		}
		catch (IOException e)
		{
			log.warn("Doom Observer: writing {}", file, e);
			inside = false;
		}
	}

	// ------------------------------------------------------------- coordinates

	/** The tile of the map square a scene coordinate stands for; in an instance that is the tile of the template. */
	private WorldPoint template(WorldPoint point)
	{
		if (point == null)
		{
			return null;
		}
		WorldView view = client.getTopLevelWorldView();
		LocalPoint local = view == null ? null : LocalPoint.fromWorld(view, point);
		return local == null ? point : WorldPoint.fromLocalInstance(client, local);
	}

	private Map<String, Object> tile(WorldPoint point)
	{
		WorldPoint template = template(point);
		if (template == null)
		{
			return null;
		}
		Map<String, Object> tile = new LinkedHashMap<>();
		tile.put("x", template.getRegionX());
		tile.put("y", template.getRegionY());
		tile.put("plane", template.getPlane());
		if (template.getRegionID() != RUINS_REGION)
		{
			tile.put("region", template.getRegionID());
		}
		if (!template.equals(point))
		{
			tile.put("raw", new int[]{point.getX(), point.getY()});
		}
		return tile;
	}

	/** In the ruins or a delve's map square, or wherever one of the Doom's NPCs is (a deep delve's own map). */
	private boolean isAtDoom()
	{
		Player player = client.getLocalPlayer();
		WorldPoint template = player == null ? null : template(player.getWorldLocation());
		if (template != null && DOOM_REGIONS.contains(template.getRegionID()))
		{
			return true;
		}
		WorldView view = client.getTopLevelWorldView();
		if (view == null)
		{
			return false;
		}
		for (NPC npc : view.npcs())
		{
			if (DOOM_NPCS.contains(npc.getId()))
			{
				return true;
			}
		}
		return false;
	}

	/**
	 * The map squares the scene is built from. An instance is made of 8 x 8 chunks copied from
	 * template squares, each with a rotation; this lists the distinct ones of the ground floor,
	 * with how many chunks of each, so that a log shows which map a delve was played on.
	 */
	private Map<String, Object> sceneMap()
	{
		WorldView view = client.getTopLevelWorldView();
		Map<String, Object> map = new LinkedHashMap<>();
		if (view == null)
		{
			return map;
		}
		map.put("instance", view.isInstance());
		List<Integer> regions = new ArrayList<>();
		for (int region : view.getMapRegions())
		{
			regions.add(region);
		}
		map.put("regions", regions);
		if (!view.isInstance())
		{
			return map;
		}
		int[][][] chunks = view.getInstanceTemplateChunks();
		Map<String, Integer> templates = new LinkedHashMap<>();
		Set<Integer> templateRegions = new TreeSet<>();
		for (int plane = 0; plane < chunks.length; plane++)
		{
			for (int[] column : chunks[plane])
			{
				for (int data : column)
				{
					if (data == -1)
					{
						continue;
					}
					int rotation = data >> 1 & 3;
					int chunkY = data >> 3 & 0x7ff;
					int chunkX = data >> 14 & 0x3ff;
					int fromPlane = data >> 24 & 3;
					int region = (chunkX >> 3) << 8 | (chunkY >> 3);
					templateRegions.add(region);
					if (plane == 0)
					{
						templates.merge(region + ":" + fromPlane + ":" + rotation, 1, Integer::sum);
					}
				}
			}
		}
		// "region:plane:rotation" -> chunks of the ground floor copied from it.
		map.put("templates", templates);
		map.put("templateRegions", templateRegions);
		return map;
	}

	// ------------------------------------------------------------------ actors

	/** "player" for the player, "npc:<index>" for an NPC, null for anyone else: other players are never written down. */
	private String ref(Actor actor)
	{
		if (actor == null)
		{
			return null;
		}
		if (actor == client.getLocalPlayer())
		{
			return "player";
		}
		return actor instanceof NPC ? "npc:" + ((NPC) actor).getIndex() : null;
	}

	private List<Map<String, Object>> spotAnims(Actor actor)
	{
		List<Map<String, Object>> list = new ArrayList<>();
		for (ActorSpotAnim spotAnim : actor.getSpotAnims())
		{
			Map<String, Object> entry = new LinkedHashMap<>();
			entry.put("id", spotAnim.getId());
			entry.put("height", spotAnim.getHeight());
			entry.put("startCycle", spotAnim.getStartCycle());
			entry.put("frame", spotAnim.getFrame());
			list.add(entry);
		}
		return list;
	}

	private Map<String, Object> describe(NPC npc)
	{
		Map<String, Object> entry = new LinkedHashMap<>();
		NPCComposition composition = npc.getTransformedComposition();
		entry.put("ref", ref(npc));
		entry.put("id", npc.getId());
		entry.put("name", npc.getName());
		if (composition != null)
		{
			entry.put("size", composition.getSize());
			entry.put("combat", composition.getCombatLevel());
		}
		entry.put("tile", tile(npc.getWorldLocation()));
		entry.put("idle", npc.getIdlePoseAnimation());
		entry.put("walk", npc.getWalkAnimation());
		entry.put("run", npc.getRunAnimation());
		return entry;
	}

	/** What an actor is doing on this tick. */
	private Map<String, Object> state(Actor actor)
	{
		Map<String, Object> entry = new LinkedHashMap<>();
		entry.put("ref", ref(actor));
		if (actor instanceof NPC)
		{
			entry.put("id", ((NPC) actor).getId());
		}
		entry.put("tile", tile(actor.getWorldLocation()));
		LocalPoint local = actor.getLocalLocation();
		if (local != null)
		{
			// Where the model is drawn, in 128ths of a tile within the scene: it lags the tile while the actor walks.
			entry.put("drawn", new int[]{local.getX(), local.getY()});
		}
		entry.put("anim", actor.getAnimation());
		entry.put("animFrame", actor.getAnimationFrame());
		entry.put("pose", actor.getPoseAnimation());
		entry.put("facing", actor.getCurrentOrientation());
		entry.put("turningTo", actor.getOrientation());
		entry.put("target", ref(actor.getInteracting()));
		entry.put("healthRatio", actor.getHealthRatio());
		entry.put("healthScale", actor.getHealthScale());
		entry.put("dead", actor.isDead());
		List<Map<String, Object>> spotAnims = spotAnims(actor);
		if (!spotAnims.isEmpty())
		{
			entry.put("spotAnims", spotAnims);
		}
		if (actor instanceof NPC && ((NPC) actor).getOverheadSpriteIds() != null)
		{
			// The prayers an NPC shows over its head: a larva's.
			entry.put("overheadArchives", ((NPC) actor).getOverheadArchiveIds());
			entry.put("overheadSprites", ((NPC) actor).getOverheadSpriteIds());
		}
		if (actor.getOverheadText() != null)
		{
			entry.put("overhead", actor.getOverheadText());
		}
		return entry;
	}

	// --------------------------------------------------------------- variables

	/** The delve's variables (see DOOM_VARPS), and whether the player runs. */
	private Map<String, Object> doomVariables()
	{
		Map<String, Object> values = new LinkedHashMap<>();
		for (int varp : DOOM_VARPS)
		{
			values.put("varp" + varp, client.getVarpValue(varp));
		}
		for (int varbit : DOOM_VARBITS)
		{
			values.put("varbit" + varbit, client.getVarbitValue(varbit));
		}
		values.put("run", client.getVarpValue(RUN_VARP));
		return values;
	}

	// -------------------------------------------------------------- interfaces

	/** A widget as it is laid out and filled: enough to draw it again. Defaults are left out. */
	private Map<String, Object> describe(Widget widget)
	{
		Map<String, Object> entry = new LinkedHashMap<>();
		entry.put("id", widget.getId());
		entry.put("child", widget.getId() & 0xffff);
		if (widget.getIndex() >= 0)
		{
			entry.put("index", widget.getIndex());
		}
		entry.put("parent", widget.getParentId());
		entry.put("type", widget.getType());
		if (widget.getContentType() != 0)
		{
			entry.put("contentType", widget.getContentType());
		}
		if (widget.isHidden())
		{
			entry.put("hidden", true);
		}
		entry.put("rect", new int[]{widget.getRelativeX(), widget.getRelativeY(), widget.getWidth(), widget.getHeight()});
		entry.put("original", new int[]{widget.getOriginalX(), widget.getOriginalY(), widget.getOriginalWidth(), widget.getOriginalHeight()});
		entry.put("modes", new int[]{widget.getXPositionMode(), widget.getYPositionMode(), widget.getWidthMode(), widget.getHeightMode()});
		if (widget.getText() != null && !widget.getText().isEmpty())
		{
			entry.put("text", widget.getText());
			entry.put("font", widget.getFontId());
			entry.put("textColor", widget.getTextColor());
			entry.put("textShadowed", widget.getTextShadowed());
			entry.put("textAlign", new int[]{widget.getXTextAlignment(), widget.getYTextAlignment()});
			entry.put("lineHeight", widget.getLineHeight());
		}
		if (widget.getName() != null && !widget.getName().isEmpty())
		{
			entry.put("name", widget.getName());
		}
		if (widget.getSpriteId() >= 0)
		{
			entry.put("sprite", widget.getSpriteId());
		}
		if (widget.getOpacity() != 0)
		{
			entry.put("opacity", widget.getOpacity());
		}
		if (widget.getType() == 3)
		{
			// A rectangle: its colour is the text colour.
			entry.put("fill", widget.isFilled());
			entry.put("color", widget.getTextColor());
		}
		if (widget.getBorderType() != 0)
		{
			entry.put("border", widget.getBorderType());
		}
		if (widget.getModelId() >= 0)
		{
			entry.put("model", widget.getModelId());
			entry.put("modelType", widget.getModelType());
			entry.put("modelZoom", widget.getModelZoom());
			entry.put("modelRotation", new int[]{widget.getRotationX(), widget.getRotationY(), widget.getRotationZ()});
			entry.put("modelAnimation", widget.getAnimationId());
		}
		if (widget.getItemId() >= 0)
		{
			entry.put("item", widget.getItemId());
			entry.put("quantity", widget.getItemQuantity());
		}
		if (widget.getActions() != null)
		{
			List<String> actions = new ArrayList<>();
			for (String action : widget.getActions())
			{
				if (action != null && !action.isEmpty())
				{
					actions.add(action);
				}
			}
			if (!actions.isEmpty())
			{
				entry.put("actions", actions);
			}
		}
		Widget[] children = widget.getDynamicChildren();
		if (children != null && children.length > 0)
		{
			List<Map<String, Object>> list = new ArrayList<>();
			for (Widget child : children)
			{
				if (child != null)
				{
					list.add(describe(child));
				}
			}
			entry.put("children", list);
		}
		return entry;
	}

	/** Every widget of an interface. Its components are numbered from 0; a long run of missing ones ends it. */
	private void dumpInterface(int group)
	{
		List<Map<String, Object>> widgets = new ArrayList<>();
		for (int child = 0, missing = 0; child < 2000 && missing < 50; child++)
		{
			Widget widget = client.getWidget(group, child);
			if (widget == null)
			{
				missing++;
				continue;
			}
			missing = 0;
			widgets.add(describe(widget));
		}
		emit("interface_dump", "group", group, "widgets", widgets, "variables", doomVariables());
	}

	// ------------------------------------------------------------- projectiles

	/**
	 * Every projectile still in the air, once a tick: where it is (128ths of a tile in the scene, and its
	 * height), whom or where it is flying at now, and the cycles left. A projectile aimed at an actor
	 * follows it; these lines show whether and how it does. When one has landed, "projectile_end".
	 */
	private void trackProjectiles()
	{
		for (Map.Entry<Projectile, Integer> entry : new ArrayList<>(projectileNumbers.entrySet()))
		{
			Projectile projectile = entry.getKey();
			boolean landed = projectile.getRemainingCycles() <= 0;
			emit(landed ? "projectile_end" : "projectile_flight",
				"n", entry.getValue(),
				"id", projectile.getId(),
				"at", new double[]{projectile.getX(), projectile.getY(), projectile.getZ()},
				"remainingCycles", projectile.getRemainingCycles(),
				"target", ref(projectile.getTargetActor()),
				"targetTile", tile(projectile.getTargetPoint()),
				"targetActorTile", projectile.getTargetActor() == null ? null : tile(projectile.getTargetActor().getWorldLocation()));
			if (landed)
			{
				projectileNumbers.remove(projectile);
			}
		}
	}

	// ------------------------------------------------------------ bars and icons

	private static Map<String, Object> spriteSize(SpritePixels sprite)
	{
		if (sprite == null)
		{
			return null;
		}
		Map<String, Object> size = new LinkedHashMap<>();
		size.put("size", new int[]{sprite.getWidth(), sprite.getHeight()});
		size.put("maxSize", new int[]{sprite.getMaxWidth(), sprite.getMaxHeight()});
		return size;
	}

	/**
	 * Where the game draws the bars and overhead icons of this tick, for the player and the Doom's NPCs:
	 * an actor's logical and model heights, its health ratio and scale, its overhead prayers, and the
	 * canvas point of its location raised by the logical height and 15, which RuneLite names as where
	 * the bars go; with the camera, to map it into the simulator. Then, in the next frame the client
	 * draws, a PNG of the frame around that point (CROP_*), beside the log: the hitpoints bar, the
	 * charge bar, the shield's bar, the prayers over the Doom and the larvae, the player's own bar and
	 * prayer, as they were drawn, to the pixel. Reading a frame that was drawn changes nothing in it.
	 * Copied from the Colosseum Observer's health-bar measurement, widened to every bar and icon.
	 */
	private void measureBars()
	{
		WorldView worldView = client.getTopLevelWorldView();
		if (worldView == null || file == null)
		{
			return;
		}
		List<Actor> actors = new ArrayList<>();
		actors.add(client.getLocalPlayer());
		for (NPC npc : worldView.npcs())
		{
			if (DOOM_NPCS.contains(npc.getId()))
			{
				actors.add(npc);
			}
		}
		int plane = worldView.getPlane();
		List<Map<String, Object>> bars = new ArrayList<>();
		List<int[]> anchors = new ArrayList<>();
		for (Actor actor : actors)
		{
			if (actor == null || ref(actor) == null || actor.getLocalLocation() == null)
			{
				continue;
			}
			Point anchor = Perspective.localToCanvas(client, actor.getLocalLocation(), plane, actor.getLogicalHeight() + 15);
			if (anchor == null)
			{
				continue;
			}
			Map<String, Object> bar = new LinkedHashMap<>();
			bar.put("actor", ref(actor));
			bar.put("logicalHeight", actor.getLogicalHeight());
			bar.put("modelHeight", actor.getModelHeight());
			bar.put("ratio", actor.getHealthRatio());
			bar.put("scale", actor.getHealthScale());
			if (actor instanceof NPC)
			{
				bar.put("overheadArchives", ((NPC) actor).getOverheadArchiveIds());
				bar.put("overheadSprites", ((NPC) actor).getOverheadSpriteIds());
			}
			else
			{
				bar.put("overheadIcon", ((Player) actor).getOverheadIcon() == null ? null : ((Player) actor).getOverheadIcon().name());
			}
			bar.put("anchor", new int[]{anchor.getX(), anchor.getY()});
			bars.add(bar);
			anchors.add(new int[]{anchor.getX(), anchor.getY()});
		}
		if (bars.isEmpty())
		{
			return;
		}
		Map<String, Object> view = new LinkedHashMap<>();
		view.put("zoom", client.getScale());
		view.put("pitch", client.getCameraPitch());
		view.put("yaw", client.getCameraYaw());
		view.put("viewport", new int[]{client.getViewportXOffset(), client.getViewportYOffset(), client.getViewportWidth(), client.getViewportHeight()});
		view.put("canvas", new int[]{client.getCanvasWidth(), client.getCanvasHeight()});
		view.put("stretched", client.isStretchedEnabled());
		int tick = client.getTickCount();
		emit("bars", "view", view, "bars", bars);
		Path crops = file.resolveSibling(file.getFileName().toString().replace(".jsonl", "-crops"));
		drawManager.requestNextFrameListener(frame ->
		{
			BufferedImage image = ImageUtil.bufferedImageFromImage(frame);
			double scaleX = (double) image.getWidth() / client.getCanvasWidth();
			double scaleY = (double) image.getHeight() / client.getCanvasHeight();
			List<Map<String, Object>> found = new ArrayList<>();
			try
			{
				Files.createDirectories(crops);
				for (int i = 0; i < anchors.size(); i++)
				{
					int x = (int) Math.round(anchors.get(i)[0] * scaleX), y = (int) Math.round(anchors.get(i)[1] * scaleY);
					int left = Math.max(0, x - (int) (CROP_ACROSS * scaleX)), top = Math.max(0, y - (int) (CROP_UP * scaleY));
					int right = Math.min(image.getWidth(), x + (int) (CROP_ACROSS * scaleX)), bottom = Math.min(image.getHeight(), y + (int) (CROP_DOWN * scaleY));
					if (right <= left || bottom <= top)
					{
						continue;
					}
					String actor = (String) bars.get(i).get("actor");
					String name = "t" + tick + "-" + actor.replace(':', '-') + ".png";
					ImageIO.write(image.getSubimage(left, top, right - left, bottom - top), "png", crops.resolve(name).toFile());
					Map<String, Object> crop = new LinkedHashMap<>();
					crop.put("actor", actor);
					crop.put("file", crops.getFileName() + "/" + name);
					// The crop's box in the frame, and the anchor in it.
					crop.put("box", new int[]{left, top, right - left, bottom - top});
					crop.put("anchor", new int[]{x - left, y - top});
					found.add(crop);
				}
			}
			catch (IOException e)
			{
				log.warn("Doom Observer: writing a crop", e);
			}
			emit("bar_crops", "image", new int[]{image.getWidth(), image.getHeight()}, "scale", new double[]{scaleX, scaleY}, "crops", found);
		});
	}

	/** A kind of bar the client loaded (hitpoints, the charge bar, the shield's): its sprites and their sizes. */
	@Subscribe
	public void onPostHealthBarConfig(PostHealthBarConfig event)
	{
		emit("bar_type",
			"frontSprite", event.getHealthBarConfig().getHealthBarFrontSpriteId(),
			"front", spriteSize(event.getHealthBarConfig().getHealthBarFrontSprite()),
			"back", spriteSize(event.getHealthBarConfig().getHealthBarBackSprite()));
	}

	// ------------------------------------------------------------------ events

	@Subscribe
	public void onGameTick(GameTick event)
	{
		tickCycle = client.getGameCycle();
		boolean nowInside = isAtDoom();
		if (nowInside != inside)
		{
			if (nowInside)
			{
				inside = true;
				emit("enter", "map", sceneMap(), "variables", doomVariables());
				for (int group : INTERFACES_ON_ENTER)
				{
					dumpInterface(group);
				}
				for (NPC npc : client.getTopLevelWorldView().npcs())
				{
					emit("npc_present", "npc", describe(npc));
				}
			}
			else
			{
				emit("leave");
				inside = false;
				close();
			}
		}
		if (!inside)
		{
			return;
		}
		Player player = client.getLocalPlayer();
		Map<String, Object> me = state(player);
		List<String> prayers = new ArrayList<>();
		for (Prayer prayer : PRAYERS)
		{
			if (client.getVarbitValue(prayer.getVarbit()) == 1)
			{
				prayers.add(prayer.name());
			}
		}
		me.put("prayers", prayers);
		me.put("overheadIcon", player.getOverheadIcon() == null ? null : player.getOverheadIcon().name());
		me.put("hp", client.getBoostedSkillLevel(Skill.HITPOINTS));
		me.put("prayer", client.getBoostedSkillLevel(Skill.PRAYER));
		me.put("runEnergy", client.getEnergy());
		me.put("run", client.getVarpValue(RUN_VARP) == 1);
		List<Map<String, Object>> npcs = new ArrayList<>();
		for (NPC npc : client.getTopLevelWorldView().npcs())
		{
			npcs.add(state(npc));
		}
		emit("tick", "player", me, "npcs", npcs);
		// An interface is written down one tick after it loaded and again three ticks after it, when its scripts have run.
		for (Map.Entry<Integer, Integer> loaded : new ArrayList<>(interfacesToDump.entrySet()))
		{
			int age = client.getTickCount() - loaded.getValue();
			if (age == 1 || age >= 3)
			{
				dumpInterface(loaded.getKey());
			}
			if (age >= 3)
			{
				interfacesToDump.remove(loaded.getKey());
			}
		}
		trackProjectiles();
		measureBars();
		seenProjectiles.values().removeIf(endCycle -> endCycle + 100 < client.getGameCycle());
		try
		{
			if (out != null)
			{
				out.flush();
			}
		}
		catch (IOException e)
		{
			log.warn("Doom Observer: flushing {}", file, e);
		}
	}

	/**
	 * Every client frame (20 ms) while the Doom is burrowed: where his model is drawn and which way it
	 * faces, when either changed. His zoom is an exact move the client glides between ticks; this shows
	 * its path, speed and turns, which the tick lines cannot.
	 */
	@Subscribe
	public void onClientTick(ClientTick event)
	{
		if (!inside)
		{
			return;
		}
		WorldView view = client.getTopLevelWorldView();
		if (view == null)
		{
			return;
		}
		for (NPC npc : view.npcs())
		{
			if (npc.getId() != BURROWED_DOOM)
			{
				continue;
			}
			LocalPoint local = npc.getLocalLocation();
			if (local == null)
			{
				continue;
			}
			String frame = local.getX() + "," + local.getY() + "," + npc.getCurrentOrientation() + "," + npc.getAnimation();
			if (frame.equals(lastBurrowFrame.put(npc.getIndex(), frame)))
			{
				continue;
			}
			emit("burrow_frame", "npc", ref(npc), "drawn", new int[]{local.getX(), local.getY()}, "facing", npc.getCurrentOrientation(), "anim", npc.getAnimation(), "tile", tile(npc.getWorldLocation()));
		}
	}

	@Subscribe
	public void onGameStateChanged(GameStateChanged event)
	{
		emit("game_state", "state", event.getGameState().name());
		// A scene loaded: a new delve, perhaps on another map.
		if (event.getGameState() == GameState.LOGGED_IN)
		{
			emit("map", "map", sceneMap(), "variables", doomVariables());
		}
	}

	@Subscribe
	public void onNpcSpawned(NpcSpawned event)
	{
		emit("npc_spawn", "npc", describe(event.getNpc()));
	}

	@Subscribe
	public void onNpcDespawned(NpcDespawned event)
	{
		emit("npc_despawn", "npc", describe(event.getNpc()));
	}

	@Subscribe
	public void onNpcChanged(NpcChanged event)
	{
		emit("npc_changed", "npc", describe(event.getNpc()), "oldId", event.getOld() == null ? null : event.getOld().getId());
	}

	@Subscribe
	public void onAnimationChanged(AnimationChanged event)
	{
		Actor actor = event.getActor();
		if (ref(actor) != null)
		{
			emit("anim", "actor", ref(actor), "anim", actor.getAnimation(), "tile", tile(actor.getWorldLocation()));
		}
	}

	@Subscribe
	public void onGraphicChanged(GraphicChanged event)
	{
		Actor actor = event.getActor();
		if (ref(actor) != null)
		{
			emit("spot_anim", "actor", ref(actor), "spotAnims", spotAnims(actor), "tile", tile(actor.getWorldLocation()));
		}
	}

	@Subscribe
	public void onProjectileMoved(ProjectileMoved event)
	{
		Projectile projectile = event.getProjectile();
		// The event comes for every frame of a flight; a projectile is written down when it is first seen.
		if (!inside || seenProjectiles.containsKey(projectile))
		{
			return;
		}
		seenProjectiles.put(projectile, projectile.getEndCycle());
		projectileNumbers.put(projectile, nextProjectileNumber);
		emit("projectile",
			"n", nextProjectileNumber++,
			"id", projectile.getId(),
			"startCycle", projectile.getStartCycle(),
			"endCycle", projectile.getEndCycle(),
			// The same two counted from the tick's start: when the projectile leaves and when it arrives.
			"startAfterTick", projectile.getStartCycle() - tickCycle,
			"endAfterTick", projectile.getEndCycle() - tickCycle,
			"remainingCycles", projectile.getRemainingCycles(),
			"slope", projectile.getSlope(),
			"startPos", projectile.getStartPos(),
			"startHeight", projectile.getStartHeight(),
			"endHeight", projectile.getEndHeight(),
			"source", ref(projectile.getSourceActor()),
			"sourceTile", tile(projectile.getSourcePoint()),
			"target", ref(projectile.getTargetActor()),
			"targetTile", tile(projectile.getTargetPoint()));
	}

	@Subscribe
	public void onGraphicsObjectCreated(GraphicsObjectCreated event)
	{
		GraphicsObject object = event.getGraphicsObject();
		LocalPoint local = object.getLocation();
		emit("graphics_object",
			"id", object.getId(),
			"startCycle", object.getStartCycle(),
			"startAfterTick", object.getStartCycle() - tickCycle,
			"height", object.getZ(),
			"tile", local == null ? null : tile(WorldPoint.fromLocal(client, local)));
	}

	@Subscribe
	public void onHitsplatApplied(HitsplatApplied event)
	{
		Actor actor = event.getActor();
		Hitsplat hitsplat = event.getHitsplat();
		if (ref(actor) != null)
		{
			emit("hitsplat", "actor", ref(actor), "type", hitsplat.getHitsplatType(), "amount", hitsplat.getAmount(), "mine", hitsplat.isMine(), "others", hitsplat.isOthers(), "disappearsOn", hitsplat.getDisappearsOnGameCycle());
		}
	}

	@Subscribe
	public void onInteractingChanged(InteractingChanged event)
	{
		if (ref(event.getSource()) != null)
		{
			emit("target", "actor", ref(event.getSource()), "target", ref(event.getTarget()));
		}
	}

	@Subscribe
	public void onActorDeath(ActorDeath event)
	{
		if (ref(event.getActor()) != null)
		{
			emit("death", "actor", ref(event.getActor()));
		}
	}

	@Subscribe
	public void onOverheadTextChanged(OverheadTextChanged event)
	{
		if (event.getActor() instanceof NPC)
		{
			emit("overhead_text", "actor", ref(event.getActor()), "text", event.getOverheadText());
		}
	}

	@Subscribe
	public void onChatMessage(ChatMessage event)
	{
		// The game's own lines only ("Delve level: 1 duration: ..."), never what a player typed.
		ChatMessageType type = event.getType();
		if (type != ChatMessageType.GAMEMESSAGE && type != ChatMessageType.SPAM && type != ChatMessageType.MESBOX && type != ChatMessageType.ENGINE)
		{
			return;
		}
		String message = event.getMessage();
		Player player = client.getLocalPlayer();
		if (message != null && player != null && player.getName() != null)
		{
			message = message.replace(player.getName(), "<player>");
		}
		emit("chat", "type", type.name(), "message", message);
	}

	@Subscribe
	public void onSoundEffectPlayed(SoundEffectPlayed event)
	{
		emit("sound", "id", event.getSoundId(), "delay", event.getDelay(), "source", ref(event.getSource()));
	}

	@Subscribe
	public void onAreaSoundEffectPlayed(AreaSoundEffectPlayed event)
	{
		WorldView view = client.getTopLevelWorldView();
		emit("area_sound",
			"id", event.getSoundId(),
			"delay", event.getDelay(),
			"range", event.getRange(),
			"source", ref(event.getSource()),
			"tile", view == null ? null : tile(WorldPoint.fromScene(view, event.getSceneX(), event.getSceneY(), view.getPlane())));
	}

	@Subscribe
	public void onVarbitChanged(VarbitChanged event)
	{
		emit("varbit", "varp", event.getVarpId(), "varbit", event.getVarbitId(), "value", event.getValue(), "variables", doomVariables());
	}

	@Subscribe
	public void onStatChanged(StatChanged event)
	{
		if (event.getSkill() == Skill.HITPOINTS || event.getSkill() == Skill.PRAYER)
		{
			emit("stat", "skill", event.getSkill().name(), "boosted", event.getBoostedLevel(), "level", event.getLevel());
		}
	}

	@Subscribe
	public void onGameObjectSpawned(GameObjectSpawned event)
	{
		GameObject object = event.getGameObject();
		emit("object_spawn", "id", object.getId(), "tile", tile(object.getWorldLocation()));
	}

	@Subscribe
	public void onGameObjectDespawned(GameObjectDespawned event)
	{
		GameObject object = event.getGameObject();
		emit("object_despawn", "id", object.getId(), "tile", tile(object.getWorldLocation()));
	}

	// Rocks, acid pools, the burrow hole and whatever else the fight places, whatever kind of object the game makes them.
	@Subscribe
	public void onWallObjectSpawned(WallObjectSpawned event)
	{
		emit("wall_object_spawn", "id", event.getWallObject().getId(), "tile", tile(event.getWallObject().getWorldLocation()));
	}

	@Subscribe
	public void onWallObjectDespawned(WallObjectDespawned event)
	{
		emit("wall_object_despawn", "id", event.getWallObject().getId(), "tile", tile(event.getWallObject().getWorldLocation()));
	}

	@Subscribe
	public void onDecorativeObjectSpawned(DecorativeObjectSpawned event)
	{
		emit("decorative_object_spawn", "id", event.getDecorativeObject().getId(), "tile", tile(event.getDecorativeObject().getWorldLocation()));
	}

	@Subscribe
	public void onDecorativeObjectDespawned(DecorativeObjectDespawned event)
	{
		emit("decorative_object_despawn", "id", event.getDecorativeObject().getId(), "tile", tile(event.getDecorativeObject().getWorldLocation()));
	}

	@Subscribe
	public void onGroundObjectSpawned(GroundObjectSpawned event)
	{
		emit("ground_object_spawn", "id", event.getGroundObject().getId(), "tile", tile(event.getGroundObject().getWorldLocation()));
	}

	@Subscribe
	public void onGroundObjectDespawned(GroundObjectDespawned event)
	{
		emit("ground_object_despawn", "id", event.getGroundObject().getId(), "tile", tile(event.getGroundObject().getWorldLocation()));
	}

	@Subscribe
	public void onWidgetLoaded(WidgetLoaded event)
	{
		emit("interface_loaded", "group", event.getGroupId());
		if (inside)
		{
			interfacesToDump.put(event.getGroupId(), client.getTickCount());
		}
	}

	@Subscribe
	public void onWidgetClosed(WidgetClosed event)
	{
		emit("interface_closed", "group", event.getGroupId(), "unload", event.isUnload());
	}

	// The player's own click, as the game was told of it: an attack, a step, a prayer, a bite of food.
	// The event is only read: it is not consumed and its entry is not changed.
	@Subscribe
	public void onMenuOptionClicked(MenuOptionClicked event)
	{
		MenuEntry entry = event.getMenuEntry();
		Player player = client.getLocalPlayer();
		// A click on another player is not written down.
		if (entry.getPlayer() != null && entry.getPlayer() != player)
		{
			return;
		}
		String target = entry.getTarget();
		if (target != null && player != null && player.getName() != null)
		{
			target = target.replace(player.getName(), "<player>");
		}
		emit("click",
			"option", entry.getOption(),
			"target", target,
			"action", entry.getType().name(),
			"identifier", entry.getIdentifier(),
			"param0", entry.getParam0(),
			"param1", entry.getParam1(),
			"npc", ref(entry.getNpc()),
			"widget", entry.getWidget() == null ? null : entry.getWidget().getId(),
			"item", entry.getItemId() < 0 ? null : entry.getItemId());
	}

	// Loot and rewards. The player's inventory and worn equipment are left out.
	@Subscribe
	public void onItemContainerChanged(ItemContainerChanged event)
	{
		if (event.getContainerId() == INVENTORY_CONTAINER || event.getContainerId() == EQUIPMENT_CONTAINER)
		{
			return;
		}
		List<int[]> items = new ArrayList<>();
		for (Item item : event.getItemContainer().getItems())
		{
			if (item.getId() >= 0)
			{
				items.add(new int[]{item.getId(), item.getQuantity()});
			}
		}
		emit("item_container", "container", event.getContainerId(), "items", items);
	}
}
