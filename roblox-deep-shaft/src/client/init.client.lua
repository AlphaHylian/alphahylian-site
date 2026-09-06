-- Input, mining requests and break effects.

local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Debris = game:GetService("Debris")

local Config = require(ReplicatedStorage.Shared.Config)
local Net = require(ReplicatedStorage.Shared.Net)
local Ui = require(script.Ui)

local player = Players.LocalPlayer
local camera = workspace.CurrentCamera

local swinging = false
local lastSent = 0
local SEND_INTERVAL = 0.1     -- cap remote traffic; the server has the real rate limit

-- ------------------------------------------------------------- targeting
local rayParams = RaycastParams.new()
rayParams.FilterType = Enum.RaycastFilterType.Exclude

local function refreshFilter()
	local list = {}
	if player.Character then table.insert(list, player.Character) end
	rayParams.FilterDescendantsInstances = list
end
refreshFilter()
player.CharacterAdded:Connect(function()
	task.wait(0.2)
	refreshFilter()
end)

local function targetUnder(position)
	local ray = camera:ViewportPointToRay(position.X, position.Y)
	local result = workspace:Raycast(ray.Origin, ray.Direction * (Config.MaxReach + 20), rayParams)
	if result and result.Instance and result.Instance.Name == "OreBlock" then
		return result.Instance
	end
	return nil
end

local function trySwing()
	local now = os.clock()
	if now - lastSent < SEND_INTERVAL then return end
	local mousePos = UserInputService:GetMouseLocation()
	local part = targetUnder(mousePos)
	if not part then return end

	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then return end
	if (root.Position - part.Position).Magnitude > Config.MaxReach then return end

	lastSent = now
	Net.Event.MineBlock:FireServer(part)
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.UserInputType == Enum.UserInputType.MouseButton1
		or input.UserInputType == Enum.UserInputType.Touch then
		swinging = true
		trySwing()
	end
end)

UserInputService.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1
		or input.UserInputType == Enum.UserInputType.Touch then
		swinging = false
	end
end)

RunService.RenderStepped:Connect(function()
	if swinging then trySwing() end
end)

-- ------------------------------------------------------------- effects
local function breakEffect(position, oreName)
	local ore = Config.Ores[oreName]
	local colour = ore and ore.colour or Color3.fromRGB(200, 200, 200)

	local attachmentPart = Instance.new("Part")
	attachmentPart.Anchored = true
	attachmentPart.CanCollide = false
	attachmentPart.Transparency = 1
	attachmentPart.Size = Vector3.one
	attachmentPart.Position = position
	attachmentPart.Parent = workspace

	local emitter = Instance.new("ParticleEmitter")
	emitter.Color = ColorSequence.new(colour)
	emitter.Lifetime = NumberRange.new(0.35, 0.7)
	emitter.Speed = NumberRange.new(8, 16)
	emitter.Rate = 0
	emitter.Rotation = NumberRange.new(0, 360)
	emitter.SpreadAngle = Vector2.new(180, 180)
	emitter.Size = NumberSequence.new(0.6)
	emitter.Parent = attachmentPart
	emitter:Emit(18)

	Debris:AddItem(attachmentPart, 1.2)
end

-- ------------------------------------------------------------- wiring
Net.Event.StateChanged.OnClientEvent:Connect(function(state)
	Ui.setState(state)
end)

Net.Event.Notify.OnClientEvent:Connect(function(text, kind)
	Ui.toast(text, kind)
end)

Net.Event.BlockBroken.OnClientEvent:Connect(function(position, oreName)
	breakEffect(position, oreName)
end)

Net.Event.OpenPanel.OnClientEvent:Connect(function(which)
	Ui.open(which)
end)

Ui.onAction = function(action, a, b)
	if action == "sell" then
		Net.Event.Sell:FireServer()
	elseif action == "buy" then
		Net.Event.BuyUpgrade:FireServer(a, b)
	elseif action == "rebirth" then
		Net.Event.Rebirth:FireServer()
	elseif action == "prompt" then
		Net.Event.PromptPurchase:FireServer(a, b)
	elseif action == "teleport" then
		Net.Event.Teleport:FireServer(a)
	end
end
