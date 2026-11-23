package openscim.doomobserver;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/** Starts the RuneLite client with the observer added to its plugins, as RuneLite's plugin template does. */
public class DoomObserverPluginTest
{
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(DoomObserverPlugin.class);
		RuneLite.main(args);
	}
}
