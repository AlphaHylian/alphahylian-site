package com.alphahylian.skirmish;

import net.fabricmc.api.ClientModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class SkirmishClient implements ClientModInitializer {
	public static final String MOD_ID = "skirmish";
	public static final Logger LOG = LoggerFactory.getLogger(MOD_ID);

	@Override
	public void onInitializeClient() {
		LOG.info("[Skirmish] loaded");
	}
}
