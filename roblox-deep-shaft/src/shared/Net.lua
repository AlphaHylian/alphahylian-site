-- Creates the remote objects on the server and waits for them on the client,
-- so both sides can just do Net.Event.MineBlock / Net.Func.GetState.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local FOLDER_NAME = "DeepShaftNet"

local EVENTS = {
	"MineBlock",      -- client -> server: I swung at this block
	"Sell",           -- client -> server: sell my ore
	"BuyUpgrade",     -- client -> server: (kind, index)
	"Rebirth",        -- client -> server
	"PromptPurchase", -- client -> server: (kind, key)
	"StateChanged",   -- server -> client: full state snapshot
	"Notify",         -- server -> client: (text, kind)
	"BlockBroken",    -- server -> all: (position, oreName) for effects
	"Teleport",       -- client -> server: take me to zone N
	"OpenPanel",      -- server -> client: ("shop" | "zones")
}

local Net = {}
Net.Event = {}

local folder
if RunService:IsServer() then
	folder = ReplicatedStorage:FindFirstChild(FOLDER_NAME)
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = FOLDER_NAME
		folder.Parent = ReplicatedStorage
	end
	for _, name in ipairs(EVENTS) do
		local ev = folder:FindFirstChild(name)
		if not ev then
			ev = Instance.new("RemoteEvent")
			ev.Name = name
			ev.Parent = folder
		end
		Net.Event[name] = ev
	end
else
	folder = ReplicatedStorage:WaitForChild(FOLDER_NAME, 30)
	if folder then
		for _, name in ipairs(EVENTS) do
			Net.Event[name] = folder:WaitForChild(name, 30)
		end
	end
end

return Net
