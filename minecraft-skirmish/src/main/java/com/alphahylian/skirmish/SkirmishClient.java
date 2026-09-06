package com.alphahylian.skirmish;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SkirmishClient implements ClientModInitializer {
	public static final String MOD_ID = "skirmish";
	public static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

	private static SkirmishConfig config;
	private static KeyMapping toggleKey;

	public static SkirmishConfig config() {
		return config;
	}

	@Override
	public void onInitializeClient() {
		config = SkirmishConfig.load();

		toggleKey = KeyMappingHelper.registerKeyMapping(new KeyMapping(
				"key.skirmish.toggle",
				InputConstants.Type.KEYSYM,
				GLFW.GLFW_KEY_RIGHT_BRACKET,
				KeyMapping.Category.MISC
		));

		HudElementRegistry.addLast(
				Identifier.fromNamespaceAndPath(MOD_ID, "hud"),
				new SkirmishHud()
		);

		ClientTickEvents.END_CLIENT_TICK.register(client -> {
			while (toggleKey.consumeClick()) {
				config.hudEnabled = !config.hudEnabled;
				config.save();
				if (client.player != null) {
					client.player.sendSystemMessage(
							Component.literal("[Skirmish] HUD " + (config.hudEnabled ? "on" : "off")));
				}
			}
		});

		LOG.info("[Skirmish] loaded — HUD toggle bound to ']' by default");
	}
}
