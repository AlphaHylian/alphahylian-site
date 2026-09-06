-- Persistence. Every DataStore call is wrapped and retried; a player who
-- cannot be loaded is given a fresh profile flagged as unsaveable, so a
-- transient outage never overwrites real progress with an empty profile.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Config = require(game:GetService("ReplicatedStorage").Shared.Config)

local DataService = {}

local STORE_NAME = "DeepShaft_v1"
local store = DataStoreService:GetDataStore(STORE_NAME)

-- Studio writes to the same DataStore as the live game, so saving is off by
-- default while testing. Flip this if you want Studio sessions to persist.
DataService.saveInStudio = false

local cache = {}      -- userId -> data
local loaded = {}     -- userId -> true once a real load (or fresh default) happened

local function defaultData()
	return {
		coins = 0,
		ore = {},
		pickaxe = 1,
		backpack = 1,
		rebirths = 0,
		passes = {},
		boostUntil = 0,
		boostMult = 1,
		receipts = {},
		totalMined = 0,
		canSave = true,
	}
end

-- Fill in anything a newer version added without clobbering existing values.
local function reconcile(data)
	local base = defaultData()
	for key, value in pairs(base) do
		if data[key] == nil then
			data[key] = value
		end
	end
	data.pickaxe = math.clamp(tonumber(data.pickaxe) or 1, 1, #Config.Pickaxes)
	data.backpack = math.clamp(tonumber(data.backpack) or 1, 1, #Config.Backpacks)
	data.coins = math.max(0, tonumber(data.coins) or 0)
	data.rebirths = math.max(0, math.floor(tonumber(data.rebirths) or 0))
	if type(data.ore) ~= "table" then data.ore = {} end
	if type(data.passes) ~= "table" then data.passes = {} end
	if type(data.receipts) ~= "table" then data.receipts = {} end
	return data
end

local function retry(fn, attempts)
	local lastErr
	for i = 1, attempts or 3 do
		local ok, result = pcall(fn)
		if ok then return true, result end
		lastErr = result
		task.wait(2 ^ i)
	end
	return false, lastErr
end

function DataService.load(player)
	local key = "u_" .. player.UserId
	local ok, stored = retry(function()
		return store:GetAsync(key)
	end)

	local data
	if ok then
		data = reconcile(stored or defaultData())
	else
		warn(("[DeepShaft] load failed for %s: %s"):format(player.Name, tostring(stored)))
		data = defaultData()
		-- Refuse to save over whatever is really in the datastore.
		data.canSave = false
	end

	cache[player.UserId] = data
	loaded[player.UserId] = true
	return data
end

function DataService.get(player)
	return cache[player.UserId]
end

function DataService.save(player)
	local data = cache[player.UserId]
	if not data or not data.canSave then return false end
	if RunService:IsStudio() and not DataService.saveInStudio then return true end

	local key = "u_" .. player.UserId
	local snapshot = {}
	for k, v in pairs(data) do
		if k ~= "canSave" then snapshot[k] = v end
	end

	local ok, err = retry(function()
		return store:UpdateAsync(key, function()
			return snapshot
		end)
	end)
	if not ok then
		warn(("[DeepShaft] save failed for %s: %s"):format(player.Name, tostring(err)))
	end
	return ok
end

function DataService.release(player)
	DataService.save(player)
	cache[player.UserId] = nil
	loaded[player.UserId] = nil
end

function DataService.start()
	task.spawn(function()
		while true do
			task.wait(Config.AutoSaveSeconds)
			for _, player in ipairs(Players:GetPlayers()) do
				if cache[player.UserId] then
					DataService.save(player)
				end
			end
		end
	end)

	game:BindToClose(function()
		for _, player in ipairs(Players:GetPlayers()) do
			DataService.save(player)
		end
		-- give the writes a moment in a live server
		if not RunService:IsStudio() then
			task.wait(3)
		end
	end)
end

return DataService
