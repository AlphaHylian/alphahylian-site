package com.alphahylian.skirmish;

import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Plain properties file so there is no dependency on a JSON library and the
 * file stays hand-editable.
 *
 * Coordinates: a negative value anchors from the opposite edge, so x = -4
 * means "four pixels in from the right".
 */
public final class SkirmishConfig {
	public boolean hudEnabled = true;

	public boolean keystrokes = true;
	public int keystrokesX = 6;
	public int keystrokesY = -80;

	public boolean stats = true;
	public int statsX = 6;
	public int statsY = 6;

	public boolean armour = true;
	public int armourX = -6;
	public int armourY = 6;

	public boolean attackBar = true;

	public boolean effects = true;
	public int effectsX = -6;
	public int effectsY = 90;

	private static final Path PATH =
			FabricLoader.getInstance().getConfigDir().resolve("skirmish.properties");

	public static SkirmishConfig load() {
		SkirmishConfig cfg = new SkirmishConfig();
		if (!Files.exists(PATH)) {
			cfg.save();
			return cfg;
		}
		Properties p = new Properties();
		try (InputStream in = Files.newInputStream(PATH)) {
			p.load(in);
		} catch (IOException e) {
			SkirmishClient.LOG.warn("[Skirmish] could not read config, using defaults", e);
			return cfg;
		}
		cfg.hudEnabled = bool(p, "hud.enabled", cfg.hudEnabled);
		cfg.keystrokes = bool(p, "keystrokes.enabled", cfg.keystrokes);
		cfg.keystrokesX = num(p, "keystrokes.x", cfg.keystrokesX);
		cfg.keystrokesY = num(p, "keystrokes.y", cfg.keystrokesY);
		cfg.stats = bool(p, "stats.enabled", cfg.stats);
		cfg.statsX = num(p, "stats.x", cfg.statsX);
		cfg.statsY = num(p, "stats.y", cfg.statsY);
		cfg.armour = bool(p, "armour.enabled", cfg.armour);
		cfg.armourX = num(p, "armour.x", cfg.armourX);
		cfg.armourY = num(p, "armour.y", cfg.armourY);
		cfg.attackBar = bool(p, "attackbar.enabled", cfg.attackBar);
		cfg.effects = bool(p, "effects.enabled", cfg.effects);
		cfg.effectsX = num(p, "effects.x", cfg.effectsX);
		cfg.effectsY = num(p, "effects.y", cfg.effectsY);
		return cfg;
	}

	public void save() {
		Properties p = new Properties();
		p.setProperty("hud.enabled", Boolean.toString(hudEnabled));
		p.setProperty("keystrokes.enabled", Boolean.toString(keystrokes));
		p.setProperty("keystrokes.x", Integer.toString(keystrokesX));
		p.setProperty("keystrokes.y", Integer.toString(keystrokesY));
		p.setProperty("stats.enabled", Boolean.toString(stats));
		p.setProperty("stats.x", Integer.toString(statsX));
		p.setProperty("stats.y", Integer.toString(statsY));
		p.setProperty("armour.enabled", Boolean.toString(armour));
		p.setProperty("armour.x", Integer.toString(armourX));
		p.setProperty("armour.y", Integer.toString(armourY));
		p.setProperty("attackbar.enabled", Boolean.toString(attackBar));
		p.setProperty("effects.enabled", Boolean.toString(effects));
		p.setProperty("effects.x", Integer.toString(effectsX));
		p.setProperty("effects.y", Integer.toString(effectsY));
		try {
			Files.createDirectories(PATH.getParent());
			try (OutputStream out = Files.newOutputStream(PATH)) {
				p.store(out, "Skirmish — negative x/y anchor from the right/bottom edge");
			}
		} catch (IOException e) {
			SkirmishClient.LOG.warn("[Skirmish] could not write config", e);
		}
	}

	private static boolean bool(Properties p, String key, boolean fallback) {
		String v = p.getProperty(key);
		return v == null ? fallback : Boolean.parseBoolean(v.trim());
	}

	private static int num(Properties p, String key, int fallback) {
		String v = p.getProperty(key);
		if (v == null) return fallback;
		try {
			return Integer.parseInt(v.trim());
		} catch (NumberFormatException e) {
			return fallback;
		}
	}
}
