-- Server-authoritative mining. The client says "I swung at that block"; the
-- server decides whether that was possible and what it was worth.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Net = require(ReplicatedStorage.Shared.Net)
local DataService = require(script.Parent.DataService)
local WorldService = require(script.Parent.WorldService)
local EconomyService = require(script.Parent.EconomyService)

local MiningService = {}

local lastSwing = {}   -- player -> os.clock() of last accepted swing
local warned = {}      -- player -> last time we told them the pack is full

local function canMineZone(data, zoneIndex)
	local zone = Config.Zones[zoneIndex]
	if not zone then return false, "That shaft does not exist." end
	if zone.vipOnly and not data.passes.VipZone then
		return false, "The VIP Shaft needs the VIP game pass."
	end
	if data.pickaxe < zone.requiredPickaxe then
		local needed = Config.Pickaxes[zone.requiredPickaxe]
		return false, ("You need the %s pickaxe for %s."):format(needed.name, zone.name)
	end
	return true
end
MiningService.canMineZone = canMineZone

-- Returns true if the block broke.
function MiningService.swing(player, part, silent)
	if typeof(part) ~= "Instance" or not part:IsA("BasePart") then return false end

	local record = WorldService.blocks[part]
	if not record or not record.alive then return false end

	local data = DataService.get(player)
	if not data then return false end

	local allowed, reason = canMineZone(data, record.zone)
	if not allowed then
		if not silent then EconomyService.notify(player, reason, "warn") end
		return false
	end

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	if not root or not humanoid or humanoid.Health <= 0 then return false end
	if (root.Position - part.Position).Magnitude > Config.MaxReach then return false end

	local pickaxe = Config.Pickaxes[data.pickaxe]
	local now = os.clock()
	if now - (lastSwing[player] or 0) < pickaxe.swing - Config.SwingGrace then
		return false
	end
	lastSwing[player] = now

	if EconomyService.oreCount(data) >= Config.capacityFor(data) then
		if not silent and now - (warned[player] or 0) > 4 then
			warned[player] = now
			EconomyService.notify(player, "Backpack full — get to a Sell pad.", "warn")
		end
		return false
	end

	record.health = record.health - pickaxe.power
	if record.health > 0 then
		return false
	end

	local oreName = record.ore
	WorldService.consume(part)
	EconomyService.addOre(player, oreName, 1)
	EconomyService.pushState(player)
	Net.Event.BlockBroken:FireAllClients(part.Position, oreName)
	return true
end

-- The Auto Mine game pass: swing at the nearest legal block on a loop.
local function autoMineLoop()
	while true do
		task.wait(0.2)
		for _, player in ipairs(Players:GetPlayers()) do
			local data = DataService.get(player)
			if data and data.passes.AutoMine then
				local character = player.Character
				local root = character and character:FindFirstChild("HumanoidRootPart")
				if root then
					-- a spatial query beats walking every block in the world,
					-- which at 2400 blocks x N players adds up fast
					local nearby = workspace:GetPartBoundsInRadius(root.Position, Config.MaxReach)
					local best, bestDist = nil, math.huge
					for _, part in ipairs(nearby) do
						local record = WorldService.blocks[part]
						if record and record.alive then
							local dist = (root.Position - part.Position).Magnitude
							if dist < bestDist then
								best, bestDist = part, dist
							end
						end
					end
					if best then
						MiningService.swing(player, best, true)
					end
				end
			end
		end
	end
end

function MiningService.start()
	Net.Event.MineBlock.OnServerEvent:Connect(function(player, part)
		MiningService.swing(player, part, false)
	end)

	Players.PlayerRemoving:Connect(function(player)
		lastSwing[player] = nil
		warned[player] = nil
	end)

	task.spawn(autoMineLoop)
end

return MiningService
