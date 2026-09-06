-- Entry point. Wires the services together and owns the player lifecycle.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Net = require(ReplicatedStorage.Shared.Net)

local DataService = require(script.DataService)
local WorldService = require(script.WorldService)
local EconomyService = require(script.EconomyService)
local MiningService = require(script.MiningService)
local MonetizationService = require(script.MonetizationService)

local currentZone = {}     -- player -> zone index
local padDebounce = {}     -- player -> { padKind -> os.clock() }

local function debounced(player, kind, seconds)
	padDebounce[player] = padDebounce[player] or {}
	local now = os.clock()
	if now - (padDebounce[player][kind] or 0) < seconds then
		return true
	end
	padDebounce[player][kind] = now
	return false
end

local function teleport(player, zoneIndex)
	local data = DataService.get(player)
	if not data then return end
	local allowed, reason = MiningService.canMineZone(data, zoneIndex)
	if not allowed then
		EconomyService.notify(player, reason, "warn")
		return
	end
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then return end
	root.CFrame = WorldService.spawnPointFor(zoneIndex)
	currentZone[player] = zoneIndex
	EconomyService.notify(player, ("Welcome to %s."):format(Config.Zones[zoneIndex].name), "good")
end

local function hookPads(root)
	for _, pad in ipairs(root:GetDescendants()) do
		local kind = pad:IsA("BasePart") and pad:GetAttribute("PadKind") or nil
		if kind then
			pad.Touched:Connect(function(hit)
				local character = hit:FindFirstAncestorOfClass("Model")
				local player = character and Players:GetPlayerFromCharacter(character)
				if not player then return end
				if kind == "Sell" then
					if debounced(player, "Sell", 0.75) then return end
					EconomyService.sell(player)
				elseif kind == "Shop" then
					if debounced(player, "Shop", 1.5) then return end
					Net.Event.OpenPanel:FireClient(player, "shop")
				elseif kind == "Lift" then
					if debounced(player, "Lift", 1.5) then return end
					Net.Event.OpenPanel:FireClient(player, "zones")
				end
			end)
		end
	end
end

local function onPlayerAdded(player)
	DataService.load(player)
	EconomyService.setupLeaderstats(player)
	EconomyService.updateLeaderstats(player)
	currentZone[player] = 1

	task.spawn(function()
		MonetizationService.refreshPasses(player)
	end)

	player.CharacterAdded:Connect(function(character)
		local root = character:WaitForChild("HumanoidRootPart", 10)
		if root then
			task.wait(0.15)
			root.CFrame = WorldService.spawnPointFor(currentZone[player] or 1)
		end
		EconomyService.pushState(player)
	end)

	EconomyService.pushState(player)
end

local function onPlayerRemoving(player)
	DataService.release(player)
	currentZone[player] = nil
	padDebounce[player] = nil
end

-- ---------------------------------------------------------------- bootstrap
local world = WorldService.build()
hookPads(world)

DataService.start()
MiningService.start()
MonetizationService.start()

Net.Event.Sell.OnServerEvent:Connect(function(player)
	EconomyService.sell(player)
end)

Net.Event.BuyUpgrade.OnServerEvent:Connect(function(player, kind, index)
	if kind ~= "pickaxe" and kind ~= "backpack" then return end
	EconomyService.buyUpgrade(player, kind, index)
end)

Net.Event.Rebirth.OnServerEvent:Connect(function(player)
	EconomyService.rebirth(player)
end)

Net.Event.Teleport.OnServerEvent:Connect(function(player, zoneIndex)
	zoneIndex = tonumber(zoneIndex)
	if not zoneIndex or not Config.Zones[zoneIndex] then return end
	teleport(player, zoneIndex)
end)

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)
for _, player in ipairs(Players:GetPlayers()) do
	task.spawn(onPlayerAdded, player)
end

print(("[%s] server ready — %d zones"):format(Config.GameName, #Config.Zones))
