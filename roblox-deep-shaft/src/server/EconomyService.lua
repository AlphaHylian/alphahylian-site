-- Coins, ore, upgrades and rebirths. The client never sends a number that
-- ends up in someone's balance; it only ever names a thing it wants to do.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage.Shared.Config)
local Net = require(ReplicatedStorage.Shared.Net)
local DataService = require(script.Parent.DataService)

local EconomyService = {}

local function oreCount(data)
	local n = 0
	for _, amount in pairs(data.ore) do
		n = n + amount
	end
	return n
end
EconomyService.oreCount = oreCount

function EconomyService.pushState(player)
	local data = DataService.get(player)
	if not data then return end
	local pickaxe = Config.Pickaxes[data.pickaxe]
	local backpack = Config.Backpacks[data.backpack]

	Net.Event.StateChanged:FireClient(player, {
		coins = data.coins,
		ore = data.ore,
		oreCount = oreCount(data),
		capacity = Config.capacityFor(data),
		pickaxe = data.pickaxe,
		pickaxeName = pickaxe.name,
		backpack = data.backpack,
		backpackName = backpack.name,
		rebirths = data.rebirths,
		rebirthCost = Config.rebirthCost(data.rebirths),
		sellMultiplier = Config.sellMultiplier(data),
		passes = data.passes,
		boostUntil = data.boostUntil,
		nextPickaxe = Config.Pickaxes[data.pickaxe + 1],
		nextBackpack = Config.Backpacks[data.backpack + 1],
	})
end

local function notify(player, text, kind)
	Net.Event.Notify:FireClient(player, text, kind or "info")
end
EconomyService.notify = notify

function EconomyService.addOre(player, oreName, amount)
	local data = DataService.get(player)
	if not data then return 0 end
	local capacity = Config.capacityFor(data)
	local room = capacity - oreCount(data)
	if room <= 0 then return 0 end

	local granted = math.min(room, amount)
	data.ore[oreName] = (data.ore[oreName] or 0) + granted
	data.totalMined = (data.totalMined or 0) + granted
	return granted
end

function EconomyService.sell(player)
	local data = DataService.get(player)
	if not data then return end
	local count = oreCount(data)
	if count <= 0 then
		notify(player, "Nothing to sell.", "warn")
		return
	end

	local mult = Config.sellMultiplier(data)
	local total = 0
	for oreName, amount in pairs(data.ore) do
		local ore = Config.Ores[oreName]
		if ore then
			total = total + ore.value * amount
		end
	end
	total = math.floor(total * mult)

	data.ore = {}
	data.coins = data.coins + total
	EconomyService.updateLeaderstats(player)
	EconomyService.pushState(player)
	notify(player, ("Sold %d ore for %s coins."):format(count, EconomyService.short(total)), "good")
end

function EconomyService.buyUpgrade(player, kind, index)
	local data = DataService.get(player)
	if not data then return end
	index = tonumber(index)
	if not index then return end

	local list, currentKey
	if kind == "pickaxe" then
		list, currentKey = Config.Pickaxes, "pickaxe"
	elseif kind == "backpack" then
		list, currentKey = Config.Backpacks, "backpack"
	else
		return
	end

	-- upgrades are strictly sequential, so you can only ever buy the next one
	if index ~= data[currentKey] + 1 then
		notify(player, "Buy the next tier first.", "warn")
		return
	end
	local entry = list[index]
	if not entry then
		notify(player, "Already fully upgraded.", "warn")
		return
	end
	if data.coins < entry.cost then
		notify(player, "Not enough coins.", "warn")
		return
	end

	data.coins = data.coins - entry.cost
	data[currentKey] = index
	EconomyService.updateLeaderstats(player)
	EconomyService.pushState(player)
	notify(player, ("Unlocked %s!"):format(entry.name), "good")
end

function EconomyService.rebirth(player)
	local data = DataService.get(player)
	if not data then return end
	local cost = Config.rebirthCost(data.rebirths)
	if data.coins < cost then
		notify(player, ("You need %s coins to rebirth."):format(EconomyService.short(cost)), "warn")
		return
	end

	data.coins = 0
	data.ore = {}
	data.pickaxe = 1
	data.backpack = 1
	data.rebirths = data.rebirths + 1

	EconomyService.updateLeaderstats(player)
	EconomyService.pushState(player)
	notify(player, ("Rebirth %d! Sales are now worth %d%% more."):format(
		data.rebirths, math.floor(data.rebirths * Config.Rebirth.bonusPerRebirth * 100)), "good")
end

function EconomyService.short(n)
	local units = { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } }
	for _, unit in ipairs(units) do
		if n >= unit[1] then
			return ("%.1f%s"):format(n / unit[1], unit[2])
		end
	end
	return tostring(math.floor(n))
end

function EconomyService.setupLeaderstats(player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	stats.Parent = player

	local coins = Instance.new("StringValue")
	coins.Name = "Coins"
	coins.Parent = stats

	local rebirths = Instance.new("IntValue")
	rebirths.Name = "Rebirths"
	rebirths.Parent = stats
end

function EconomyService.updateLeaderstats(player)
	local data = DataService.get(player)
	local stats = player:FindFirstChild("leaderstats")
	if not data or not stats then return end
	local coins = stats:FindFirstChild("Coins")
	local rebirths = stats:FindFirstChild("Rebirths")
	if coins then coins.Value = EconomyService.short(data.coins) end
	if rebirths then rebirths.Value = data.rebirths end
end

return EconomyService
