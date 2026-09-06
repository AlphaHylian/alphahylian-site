package com.alphahylian.skirmish;

import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

public final class SkirmishHud implements HudElement {
	private static final int BG = 0x80000000;
	private static final int BG_ON = 0xC0FFFFFF;
	private static final int TEXT = 0xFFFFFFFF;
	private static final int TEXT_ON = 0xFF101010;
	private static final int DIM = 0xFFB0B0B8;
	private static final int GOOD = 0xFF5FD98A;
	private static final int WARN = 0xFFE8B14A;
	private static final int BAD = 0xFFE05A4A;

	private final CpsTracker leftCps = new CpsTracker();
	private final CpsTracker rightCps = new CpsTracker();

	/** Negative coordinates anchor from the far edge. */
	private static int anchor(int value, int screen, int size) {
		return value >= 0 ? value : screen + value - size;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, DeltaTracker delta) {
		Minecraft mc = Minecraft.getInstance();
		SkirmishConfig cfg = SkirmishClient.config();

		if (!cfg.hudEnabled) return;
		if (mc.player == null || mc.level == null) return;
		// No hideGui flag exists in 26.2 — when the HUD is toggled off with F1
		// the registry never calls this, so there is nothing to check.

		LocalPlayer player = mc.player;
		Font font = mc.font;
		int w = g.guiWidth();
		int h = g.guiHeight();

		// CPS is sampled every frame regardless of whether the module is shown,
		// so switching it on mid-fight doesn't start from zero.
		leftCps.sample(mc.options.keyAttack.isDown());
		rightCps.sample(mc.options.keyUse.isDown());

		if (cfg.keystrokes) drawKeystrokes(g, font, mc, cfg, w, h);
		if (cfg.stats) drawStats(g, font, mc, cfg, w, h);
		if (cfg.armour) drawArmour(g, font, player, cfg, w, h);
		if (cfg.effects) drawEffects(g, font, player, cfg, w, h);
		if (cfg.attackBar) drawAttackBar(g, player, w, h);
	}

	// ------------------------------------------------------------ keystrokes
	private void drawKeystrokes(GuiGraphicsExtractor g, Font font, Minecraft mc,
	                            SkirmishConfig cfg, int w, int h) {
		final int key = 22;      // key size
		final int gap = 2;
		final int blockW = key * 3 + gap * 2;
		final int blockH = key * 2 + gap + (key + gap) * 2;

		int x = anchor(cfg.keystrokesX, w, blockW);
		int y = anchor(cfg.keystrokesY, h, blockH);

		drawKey(g, font, x + key + gap, y, key, key, "W", mc.options.keyUp.isDown());
		drawKey(g, font, x, y + key + gap, key, key, "A", mc.options.keyLeft.isDown());
		drawKey(g, font, x + key + gap, y + key + gap, key, key, "S", mc.options.keyDown.isDown());
		drawKey(g, font, x + (key + gap) * 2, y + key + gap, key, key, "D", mc.options.keyRight.isDown());

		int row = y + (key + gap) * 2;
		int half = (blockW - gap) / 2;
		drawKey(g, font, x, row, half, key, "L " + leftCps.cps(), mc.options.keyAttack.isDown());
		drawKey(g, font, x + half + gap, row, blockW - half - gap, key, "R " + rightCps.cps(),
				mc.options.keyUse.isDown());

		int space = row + key + gap;
		drawKey(g, font, x, space, blockW, key - 6, "", mc.options.keyJump.isDown());
		// a bar rather than a glyph reads better at this size
		boolean jump = mc.options.keyJump.isDown();
		g.fill(x + 5, space + (key - 6) / 2, x + blockW - 5, space + (key - 6) / 2 + 1,
				jump ? TEXT_ON : TEXT);
	}

	private void drawKey(GuiGraphicsExtractor g, Font font, int x, int y, int w, int h,
	                     String label, boolean down) {
		g.fill(x, y, x + w, y + h, down ? BG_ON : BG);
		if (!label.isEmpty()) {
			int tw = font.width(label);
			g.text(font, label, x + (w - tw) / 2, y + (h - 8) / 2, down ? TEXT_ON : TEXT);
		}
	}

	// ----------------------------------------------------------------- stats
	private void drawStats(GuiGraphicsExtractor g, Font font, Minecraft mc,
	                       SkirmishConfig cfg, int w, int h) {
		int fps = mc.getFps();
		String fpsText = fps + " fps";

		String pingText = null;
		if (mc.getConnection() != null && mc.player != null) {
			PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
			if (info != null) {
				pingText = info.getLatency() + " ms";
			}
		}

		int width = font.width(fpsText);
		if (pingText != null) width = Math.max(width, font.width(pingText));
		int lines = pingText != null ? 2 : 1;

		int x = anchor(cfg.statsX, w, width + 8);
		int y = anchor(cfg.statsY, h, lines * 10 + 6);

		g.fill(x, y, x + width + 8, y + lines * 10 + 6, BG);
		g.text(font, fpsText, x + 4, y + 4, fps >= 60 ? GOOD : (fps >= 30 ? WARN : BAD));
		if (pingText != null) {
			int ms = mc.getConnection().getPlayerInfo(mc.player.getUUID()).getLatency();
			g.text(font, pingText, x + 4, y + 14, ms <= 80 ? GOOD : (ms <= 160 ? WARN : BAD));
		}
	}

	// ---------------------------------------------------------------- armour
	private static final EquipmentSlot[] ARMOUR = {
			EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET
	};

	private void drawArmour(GuiGraphicsExtractor g, Font font, LocalPlayer player,
	                        SkirmishConfig cfg, int w, int h) {
		java.util.List<String> rows = new java.util.ArrayList<>();
		java.util.List<Integer> colours = new java.util.ArrayList<>();

		for (EquipmentSlot slot : ARMOUR) {
			ItemStack stack = player.getItemBySlot(slot);
			if (stack.isEmpty()) continue;
			rows.add(describe(stack));
			colours.add(durabilityColour(stack));
		}
		ItemStack hand = player.getMainHandItem();
		if (!hand.isEmpty() && hand.isDamageableItem()) {
			rows.add(describe(hand));
			colours.add(durabilityColour(hand));
		}
		if (rows.isEmpty()) return;

		int width = 0;
		for (String row : rows) width = Math.max(width, font.width(row));
		int boxW = width + 8;
		int boxH = rows.size() * 10 + 6;

		int x = anchor(cfg.armourX, w, boxW);
		int y = anchor(cfg.armourY, h, boxH);

		g.fill(x, y, x + boxW, y + boxH, BG);
		for (int i = 0; i < rows.size(); i++) {
			String row = rows.get(i);
			g.text(font, row, x + boxW - 4 - font.width(row), y + 4 + i * 10, colours.get(i));
		}
	}

	private static String describe(ItemStack stack) {
		String name = stack.getHoverName().getString();
		if (!stack.isDamageableItem()) return name;
		int left = stack.getMaxDamage() - stack.getDamageValue();
		return name + "  " + left;
	}

	private static int durabilityColour(ItemStack stack) {
		if (!stack.isDamageableItem()) return TEXT;
		int max = stack.getMaxDamage();
		if (max <= 0) return TEXT;
		float frac = (max - stack.getDamageValue()) / (float) max;
		if (frac > 0.5f) return GOOD;
		if (frac > 0.2f) return WARN;
		return BAD;
	}

	// --------------------------------------------------------------- effects
	private void drawEffects(GuiGraphicsExtractor g, Font font, LocalPlayer player,
	                         SkirmishConfig cfg, int w, int h) {
		java.util.Collection<MobEffectInstance> active = player.getActiveEffects();
		if (active.isEmpty()) return;

		java.util.List<String> rows = new java.util.ArrayList<>();
		for (MobEffectInstance effect : active) {
			String name = effect.getEffect().value().getDisplayName().getString();
			int amp = effect.getAmplifier();
			if (amp > 0) name = name + " " + roman(amp + 1);
			rows.add(effect.isInfiniteDuration() ? name + "  **" : name + "  " + time(effect.getDuration()));
		}

		int width = 0;
		for (String row : rows) width = Math.max(width, font.width(row));
		int boxW = width + 8;
		int boxH = rows.size() * 10 + 6;

		int x = anchor(cfg.effectsX, w, boxW);
		int y = anchor(cfg.effectsY, h, boxH);

		g.fill(x, y, x + boxW, y + boxH, BG);
		for (int i = 0; i < rows.size(); i++) {
			String row = rows.get(i);
			g.text(font, row, x + boxW - 4 - font.width(row), y + 4 + i * 10, DIM);
		}
	}

	private static String time(int ticks) {
		int seconds = ticks / 20;
		return (seconds / 60) + ":" + String.format("%02d", seconds % 60);
	}

	private static String roman(int n) {
		return switch (n) {
			case 1 -> "I";
			case 2 -> "II";
			case 3 -> "III";
			case 4 -> "IV";
			case 5 -> "V";
			default -> Integer.toString(n);
		};
	}

	// ------------------------------------------------------------ attack bar
	private void drawAttackBar(GuiGraphicsExtractor g, LocalPlayer player, int w, int h) {
		float charge = player.getAttackStrengthScale(0.0f);
		if (charge >= 1.0f) return;   // only in the way while it matters

		int barW = 62;
		int barH = 3;
		int x = (w - barW) / 2;
		int y = h / 2 + 12;

		g.fill(x - 1, y - 1, x + barW + 1, y + barH + 1, BG);
		int filled = Math.round(barW * charge);
		g.fill(x, y, x + filled, y + barH, charge > 0.9f ? GOOD : WARN);
	}
}
