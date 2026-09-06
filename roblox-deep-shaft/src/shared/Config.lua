-- Every tunable value in the game lives here. Balance changes should not
-- require touching any other file.

local Config = {}

Config.GameName = "Deep Shaft"

-- ==========================================================================
-- MONETISATION IDS  ->  fill these in from the Creator Dashboard.
-- Everything still runs with the zeros in place; the prompts just no-op and
-- the shop marks those entries as unavailable, so you can test the whole
-- game before any of this exists.
-- ==========================================================================
Config.GamePasses = {
	DoubleCoins   = { id = 0, name = "2x Coins",       blurb = "Every sale pays double, forever.",        robux = 99 },
	DoubleCapacity= { id = 0, name = "2x Backpack",    blurb = "Carry twice as much ore per trip.",       robux = 99 },
	AutoMine      = { id = 0, name = "Auto Mine",      blurb = "Your pickaxe swings on its own.",         robux = 199 },
	VipZone       = { id = 0, name = "VIP Shaft",      blurb = "A private shaft with the richest ore.",   robux = 249 },
}

Config.Products = {
	Coins1k   = { id = 0, name = "1,000 Coins",   grant = { coins = 1000 },   robux = 25 },
	Coins10k  = { id = 0, name = "10,000 Coins",  grant = { coins = 10000 },  robux = 99 },
	Coins100k = { id = 0, name = "100,000 Coins", grant = { coins = 100000 }, robux = 499 },
	Boost2x   = { id = 0, name = "2x Coins (10m)", grant = { boostSeconds = 600, boostMult = 2 }, robux = 49 },
}

-- pairs() order is undefined, so the shop uses these to stay put between opens
Config.PassOrder = { "DoubleCoins", "DoubleCapacity", "AutoMine", "VipZone" }
Config.ProductOrder = { "Coins1k", "Coins10k", "Coins100k", "Boost2x" }

-- ==========================================================================
-- ORE
-- value is per unit, hardness is how many points of pickaxe power a block
-- soaks up before it breaks.
-- ==========================================================================
Config.Ores = {
	Stone    = { value = 1,    hardness = 3,    colour = Color3.fromRGB(124, 122, 120) },
	Coal     = { value = 5,    hardness = 6,    colour = Color3.fromRGB(46, 46, 50) },
	Iron     = { value = 18,   hardness = 12,   colour = Color3.fromRGB(216, 180, 140) },
	Redstone = { value = 40,   hardness = 20,   colour = Color3.fromRGB(224, 58, 58) },
	Gold     = { value = 95,   hardness = 32,   colour = Color3.fromRGB(242, 210, 74) },
	Diamond  = { value = 260,  hardness = 55,   colour = Color3.fromRGB(94, 232, 224) },
	Obsidian = { value = 700,  hardness = 110,  colour = Color3.fromRGB(52, 42, 78) },
	Ancient  = { value = 2400, hardness = 240,  colour = Color3.fromRGB(150, 90, 40) },
}

-- ==========================================================================
-- ZONES  (index order == depth order)
-- weights are relative; requiredPickaxe is an index into Config.Pickaxes.
-- ==========================================================================
Config.Zones = {
	{
		name = "Surface Quarry", requiredPickaxe = 1, vipOnly = false,
		origin = Vector3.new(0, 0, 0),
		weights = { Stone = 70, Coal = 30 },
	},
	{
		name = "Iron Cavern", requiredPickaxe = 2, vipOnly = false,
		origin = Vector3.new(0, -60, 0),
		weights = { Stone = 40, Coal = 35, Iron = 25 },
	},
	{
		name = "Redstone Depths", requiredPickaxe = 3, vipOnly = false,
		origin = Vector3.new(0, -120, 0),
		weights = { Coal = 25, Iron = 35, Redstone = 30, Gold = 10 },
	},
	{
		name = "Gold Hollow", requiredPickaxe = 4, vipOnly = false,
		origin = Vector3.new(0, -180, 0),
		weights = { Iron = 25, Redstone = 30, Gold = 33, Diamond = 12 },
	},
	{
		name = "The Deep Shaft", requiredPickaxe = 5, vipOnly = false,
		origin = Vector3.new(0, -240, 0),
		weights = { Gold = 30, Diamond = 40, Obsidian = 30 },
	},
	{
		name = "VIP Shaft", requiredPickaxe = 3, vipOnly = true,
		origin = Vector3.new(300, -120, 0),
		weights = { Gold = 25, Diamond = 35, Obsidian = 25, Ancient = 15 },
	},
}

-- ==========================================================================
-- UPGRADES
-- ==========================================================================
Config.Pickaxes = {
	{ name = "Wooden",    power = 1,   swing = 0.55, cost = 0 },
	{ name = "Stone",     power = 3,   swing = 0.50, cost = 500 },
	{ name = "Iron",      power = 8,   swing = 0.45, cost = 4000 },
	{ name = "Gold",      power = 18,  swing = 0.40, cost = 25000 },
	{ name = "Diamond",   power = 42,  swing = 0.34, cost = 150000 },
	{ name = "Obsidian",  power = 95,  swing = 0.28, cost = 900000 },
	{ name = "Ancient",   power = 220, swing = 0.22, cost = 5000000 },
}

Config.Backpacks = {
	{ name = "Satchel",     capacity = 25,     cost = 0 },
	{ name = "Rucksack",    capacity = 80,     cost = 750 },
	{ name = "Crate",       capacity = 250,    cost = 6000 },
	{ name = "Cart",        capacity = 900,    cost = 40000 },
	{ name = "Hauler",      capacity = 3200,   cost = 260000 },
	{ name = "Freight Rig", capacity = 12000,  cost = 1500000 },
}

-- ==========================================================================
-- REBIRTH
-- ==========================================================================
Config.Rebirth = {
	baseCost = 1000000,      -- coins needed for rebirth #1
	costGrowth = 3.2,        -- multiplied per rebirth
	bonusPerRebirth = 0.25,  -- +25% sell value each time
}

-- ==========================================================================
-- RULES
-- ==========================================================================
Config.MaxReach = 30            -- studs; server rejects mining beyond this
Config.BlockRespawn = 6         -- seconds before a mined block comes back
Config.BlockSize = 6            -- studs
Config.GridX, Config.GridY, Config.GridZ = 10, 4, 10
Config.AutoSaveSeconds = 90
Config.SwingGrace = 0.05        -- allowance for latency on the swing cooldown

function Config.rebirthCost(rebirths)
	return math.floor(Config.Rebirth.baseCost * (Config.Rebirth.costGrowth ^ rebirths))
end

function Config.sellMultiplier(data)
	local mult = 1 + (data.rebirths * Config.Rebirth.bonusPerRebirth)
	if data.passes.DoubleCoins then mult = mult * 2 end
	if data.boostUntil and os.time() < data.boostUntil then
		mult = mult * (data.boostMult or 2)
	end
	return mult
end

function Config.capacityFor(data)
	local pack = Config.Backpacks[data.backpack] or Config.Backpacks[1]
	local cap = pack.capacity
	if data.passes.DoubleCapacity then cap = cap * 2 end
	return cap
end

return Config
