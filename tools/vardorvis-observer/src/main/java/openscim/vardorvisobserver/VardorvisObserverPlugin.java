package openscim.vardorvisobserver;

import com.google.gson.Gson;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.inject.Inject;
import lombok.extern.slf4j.Slf4j;
import net.runelite.api.Actor;
import net.runelite.api.ActorSpotAnim;
import net.runelite.api.ChatMessageType;
import net.runelite.api.Client;
import net.runelite.api.GameObject;
import net.runelite.api.GraphicsObject;
import net.runelite.api.Hitsplat;
import net.runelite.api.Item;
import net.runelite.api.MenuEntry;
import net.runelite.api.NPC;
import net.runelite.api.NPCComposition;
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

/**
 * Writes down what the game client is told at Vardorvis: one JSON object per
 * line in ~/.runelite/vardorvis-observer/vardorvis-&lt;time&gt;.jsonl. A copy of
 * the Colosseum Observer (OpenScim-colosseum/tools/colosseum-observer) with
 * the Colosseum's own parts taken out and Vardorvis's put in.
 *
 * It only listens. It draws nothing, plays nothing, adds no menu entry, sends
 * no input and no network request, and changes nothing in the client: every
 * call it makes on the RuneLite API is a getter. Nothing about other players
 * is written, and the player's own name is replaced in chat lines and menu
 * targets. The inventory and the worn equipment are not written.
 *
 * What is written: every tick the player and every NPC (tile, animation,
 * facing, target, health, spot animations); NPCs appearing and leaving
 * (Vardorvis, the tendrils, the axes, the head); animations and spot
 * animations as they start; every projectile with its cycles, heights and
 * slope (the head's gaze); graphics on the ground (the cracks and spikes);
 * hitsplats (the bleed, the heals); the game's chat lines; sounds; the
 * player's own clicks (the spores of the strangle); every interface that
 * opens, widget by widget (the strangle's overlay); objects of the scene (the
 * barrier); item containers other than the player's own (the loot); and
 * Vardorvis's variables whenever one changes.
 *
 * Every line has "e" (what it is), "t" (the game tick, counted by the client
 * since login), "c" (the client cycle, 20 ms each, 30 to a tick) and "ct" (the
 * cycles since this tick's GameTick event). A tile is [x, y] within the
 * Stranglewood's ritual site (region 4405), south-west first, which is the
 * form client/encounters/vardorvis/ uses; "raw" beside it is the scene's own
 * coordinate when the two differ (the fight is an instance).
 */
@Slf4j
@PluginDescriptor(
	name = "Vardorvis Observer",
	description = "Records what the game shows at Vardorvis to a file. Draws nothing, sends nothing.",
	tags = {"vardorvis", "log", "timing"}
)
public class VardorvisObserverPlugin extends Plugin
{
	// The ritual site in the Stranglewood: the rocks outside and the instance's template.
	private static final int VARDORVIS_REGION = 4405;
	// The strangle's spores (RSPSApp/tsps reads varbits vardorvis_qte_1..6 on it).
	private static final int STRANGLE_VARP = 3942;
	// Run switched on.
	private static final int RUN_VARP = 173;
	private static final Prayer[] PRAYERS = Prayer.values();

	@Inject
	private Client client;

	@Inject
	private Gson gson;

	private BufferedWriter out;
	private Path file;
	private boolean inside;
	private int tickCycle;
	// The projectiles already written down, with the cycle each ends on.
	private final Map<Projectile, Integer> seenProjectiles = new IdentityHashMap<>();
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
		Path directory = RuneLite.RUNELITE_DIR.toPath().resolve("vardorvis-observer");
		Files.createDirectories(directory);
		file = directory.resolve("vardorvis-" + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + ".jsonl");
		out = Files.newBufferedWriter(file, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
		log.info("Vardorvis Observer: writing to {}", file);
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
				log.warn("Vardorvis Observer: closing {}", file, e);
			}
			out = null;
		}
	}

	/** One line: the event's name, the clocks, then the pairs of `fields`. Nothing is written away from Vardorvis. */
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
			log.warn("Vardorvis Observer: writing {}", file, e);
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
		if (template.getRegionID() != VARDORVIS_REGION)
		{
			tile.put("region", template.getRegionID());
		}
		if (!template.equals(point))
		{
			tile.put("raw", new int[]{point.getX(), point.getY()});
		}
		return tile;
	}

	private boolean isAtVardorvis()
	{
		Player player = client.getLocalPlayer();
		WorldPoint template = player == null ? null : template(player.getWorldLocation());
		return template != null && template.getRegionID() == VARDORVIS_REGION;
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
		if (actor.getOverheadText() != null)
		{
			entry.put("overhead", actor.getOverheadText());
		}
		return entry;
	}

	// --------------------------------------------------------------- variables

	/** Vardorvis's variables: the strangle's spores, and whether the player runs (the bleed comes sooner then). */
	private Map<String, Object> vardorvisVariables()
	{
		Map<String, Object> values = new LinkedHashMap<>();
		values.put("strangle", client.getVarpValue(STRANGLE_VARP));
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
		emit("interface_dump", "group", group, "widgets", widgets, "variables", vardorvisVariables());
	}

	// ------------------------------------------------------------------ events

	@Subscribe
	public void onGameTick(GameTick event)
	{
		tickCycle = client.getGameCycle();
		boolean nowInside = isAtVardorvis();
		if (nowInside != inside)
		{
			if (nowInside)
			{
				inside = true;
				emit("enter", "instance", client.getTopLevelWorldView().isInstance(), "variables", vardorvisVariables());
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
			log.warn("Vardorvis Observer: flushing {}", file, e);
		}
	}

	@Subscribe
	public void onGameStateChanged(GameStateChanged event)
	{
		emit("game_state", "state", event.getGameState().name());
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
		emit("projectile",
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
		// The game's own lines only ("Vardorvis' head gazes upon you..."), never what a player typed.
		ChatMessageType type = event.getType();
		if (type != ChatMessageType.GAMEMESSAGE && type != ChatMessageType.SPAM && type != ChatMessageType.MESBOX)
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
		emit("varbit", "varp", event.getVarpId(), "varbit", event.getVarbitId(), "value", event.getValue(), "variables", vardorvisVariables());
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

	// The barrier's tendrils and whatever else the fight places, whatever kind of object the game makes them.
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

	// The player's own click, as the game was told of it: a spore of the strangle, an attack, a step, a bite of food.
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
