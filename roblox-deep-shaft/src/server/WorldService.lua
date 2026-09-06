-- Builds every zone at runtime: a floor, a grid of ore blocks, a sell pad and
-- a lift pad. Nothing needs to exist in the place file beforehand.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage.Shared.Config)

local WorldService = {}

local blocks = {}     -- Part -> { ore, health, maxHealth, zone, alive, cframe }
local zoneFolders = {}

WorldService.blocks = blocks

local function pickOre(zone)
	local total = 0
	for _, weight in pairs(zone.weights) do
		total = total + weight
	end
	local roll = math.random() * total
	for name, weight in pairs(zone.weights) do
		roll = roll - weight
		if roll <= 0 then
			return name
		end
	end
	return (next(zone.weights))
end

local function styleBlock(part, oreName)
	local ore = Config.Ores[oreName]
	part.Color = ore.colour
	part.Material = (oreName == "Stone" or oreName == "Coal") and Enum.Material.Slate or Enum.Material.Metal
	part:SetAttribute("Ore", oreName)
end

local function makeBlock(zoneIndex, cframe, parent)
	local zone = Config.Zones[zoneIndex]
	local oreName = pickOre(zone)
	local ore = Config.Ores[oreName]

	local part = Instance.new("Part")
	part.Name = "OreBlock"
	part.Size = Vector3.new(Config.BlockSize, Config.BlockSize, Config.BlockSize)
	part.CFrame = cframe
	part.Anchored = true
	part.CanCollide = true
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	styleBlock(part, oreName)
	part.Parent = parent

	blocks[part] = {
		ore = oreName,
		health = ore.hardness,
		maxHealth = ore.hardness,
		zone = zoneIndex,
		alive = true,
		cframe = cframe,
	}
	return part
end

-- A mined block goes invisible rather than being destroyed, so the reference
-- stays valid and respawning is just a matter of flipping it back on.
function WorldService.consume(part)
	local record = blocks[part]
	if not record or not record.alive then return end
	record.alive = false
	part.Transparency = 1
	part.CanCollide = false

	task.delay(Config.BlockRespawn, function()
		if not blocks[part] or part.Parent == nil then return end
		local zone = Config.Zones[record.zone]
		local oreName = pickOre(zone)
		record.ore = oreName
		record.health = Config.Ores[oreName].hardness
		record.maxHealth = record.health
		record.alive = true
		styleBlock(part, oreName)
		part.Transparency = 0
		part.CanCollide = true
	end)
end

local function makePad(name, colour, size, cframe, parent)
	local pad = Instance.new("Part")
	pad.Name = name
	pad.Size = size
	pad.CFrame = cframe
	pad.Anchored = true
	pad.CanCollide = false
	pad.Material = Enum.Material.Neon
	pad.Color = colour
	pad.Transparency = 0.35
	pad.Parent = parent

	local sign = Instance.new("SurfaceGui")
	sign.Face = Enum.NormalId.Top
	sign.CanvasSize = Vector2.new(400, 200)
	sign.Parent = pad
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = name
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextScaled = true
	label.Font = Enum.Font.GothamBold
	label.Parent = sign

	return pad
end

function WorldService.build()
	local root = Instance.new("Folder")
	root.Name = "DeepShaftWorld"
	root.Parent = workspace

	for zoneIndex, zone in ipairs(Config.Zones) do
		local folder = Instance.new("Folder")
		folder.Name = "Zone" .. zoneIndex
		folder.Parent = root
		zoneFolders[zoneIndex] = folder

		local size = Config.BlockSize
		local originX = zone.origin.X - (Config.GridX * size) / 2
		local originZ = zone.origin.Z - (Config.GridZ * size) / 2

		-- floor
		local floor = Instance.new("Part")
		floor.Name = "Floor"
		floor.Anchored = true
		floor.Size = Vector3.new(Config.GridX * size + 60, 4, Config.GridZ * size + 60)
		floor.CFrame = CFrame.new(zone.origin.X, zone.origin.Y - size * Config.GridY - 2, zone.origin.Z)
		floor.Color = Color3.fromRGB(48, 46, 44)
		floor.Material = Enum.Material.Rock
		floor.TopSurface = Enum.SurfaceType.Smooth
		floor.Parent = folder

		-- ore grid
		for gx = 0, Config.GridX - 1 do
			for gy = 0, Config.GridY - 1 do
				for gz = 0, Config.GridZ - 1 do
					local cf = CFrame.new(
						originX + gx * size + size / 2,
						zone.origin.Y - gy * size - size / 2,
						originZ + gz * size + size / 2
					)
					makeBlock(zoneIndex, cf, folder)
				end
			end
		end

		-- pads sit just off the edge of the grid
		local edge = (Config.GridZ * size) / 2 + 14
		local padY = zone.origin.Y - size * Config.GridY + 1

		local sell = makePad("Sell", Color3.fromRGB(80, 220, 120),
			Vector3.new(18, 1, 18),
			CFrame.new(zone.origin.X - 16, padY, zone.origin.Z + edge), folder)
		sell:SetAttribute("PadKind", "Sell")

		local shop = makePad("Shop", Color3.fromRGB(120, 160, 255),
			Vector3.new(18, 1, 18),
			CFrame.new(zone.origin.X + 16, padY, zone.origin.Z + edge), folder)
		shop:SetAttribute("PadKind", "Shop")

		local lift = makePad(zone.name, Color3.fromRGB(255, 170, 60),
			Vector3.new(46, 1, 10),
			CFrame.new(zone.origin.X, padY, zone.origin.Z - edge), folder)
		lift:SetAttribute("PadKind", "Lift")
		lift:SetAttribute("Zone", zoneIndex)
	end

	-- Without this, players spawn at the world origin, which is inside the
	-- first zone's ore grid.
	local spawnCf = WorldService.spawnPointFor(1)
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "DeepShaftSpawn"
	spawn.Size = Vector3.new(20, 1, 20)
	spawn.CFrame = spawnCf * CFrame.new(0, -2, 0)
	spawn.Anchored = true
	spawn.CanCollide = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Color = Color3.fromRGB(90, 200, 130)
	spawn.Material = Enum.Material.Neon
	spawn.Parent = root

	return root
end

function WorldService.spawnPointFor(zoneIndex)
	local zone = Config.Zones[zoneIndex] or Config.Zones[1]
	local padY = zone.origin.Y - Config.BlockSize * Config.GridY + 5
	local edge = (Config.GridZ * Config.BlockSize) / 2 + 22
	return CFrame.new(zone.origin.X, padY, zone.origin.Z + edge)
end

return WorldService
