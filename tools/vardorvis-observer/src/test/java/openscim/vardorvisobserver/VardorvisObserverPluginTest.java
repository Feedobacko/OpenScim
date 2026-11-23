package openscim.vardorvisobserver;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/** Starts the RuneLite client with the observer added to its plugins, as RuneLite's plugin template does. */
public class VardorvisObserverPluginTest
{
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(VardorvisObserverPlugin.class);
		RuneLite.main(args);
	}
}
