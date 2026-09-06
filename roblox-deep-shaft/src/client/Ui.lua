-- All of the interface, built in code so the place file stays empty.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)

local player = Players.LocalPlayer

local Ui = {}
Ui.onAction = nil     -- function(action, a, b) set by the client script

local COL = {
	bg      = Color3.fromRGB(18, 18, 22),
	panel   = Color3.fromRGB(28, 28, 34),
	stroke  = Color3.fromRGB(58, 58, 68),
	text    = Color3.fromRGB(240, 240, 245),
	dim     = Color3.fromRGB(160, 160, 172),
	accent  = Color3.fromRGB(255, 170, 60),
	good    = Color3.fromRGB(90, 220, 130),
	warn    = Color3.fromRGB(255, 110, 90),
}

local state = {}

local function corner(parent, radius)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, radius or 10)
	c.Parent = parent
	return c
end

local function stroke(parent, colour)
	local s = Instance.new("UIStroke")
	s.Color = colour or COL.stroke
	s.Thickness = 1
	s.Parent = parent
	return s
end

local function label(parent, text, size, colour, bold)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Text = text
	l.TextSize = size or 16
	l.TextColor3 = colour or COL.text
	l.Font = bold and Enum.Font.GothamBold or Enum.Font.Gotham
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.Parent = parent
	return l
end

local function button(parent, text, colour)
	local b = Instance.new("TextButton")
	b.BackgroundColor3 = colour or COL.panel
	b.AutoButtonColor = true
	b.Text = text
	b.TextSize = 16
	b.Font = Enum.Font.GothamBold
	b.TextColor3 = COL.text
	b.Parent = parent
	corner(b, 8)
	stroke(b)
	return b
end

-- ------------------------------------------------------------------ layout
local gui = Instance.new("ScreenGui")
gui.Name = "DeepShaftUI"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

-- HUD
local hud = Instance.new("Frame")
hud.Size = UDim2.new(0, 260, 0, 116)
hud.Position = UDim2.new(0, 16, 0, 16)
hud.BackgroundColor3 = COL.bg
hud.BackgroundTransparency = 0.1
hud.Parent = gui
corner(hud, 12)
stroke(hud)

local coinsLabel = label(hud, "0", 26, COL.accent, true)
coinsLabel.Size = UDim2.new(1, -24, 0, 32)
coinsLabel.Position = UDim2.new(0, 14, 0, 10)

local coinsCaption = label(hud, "COINS", 11, COL.dim, true)
coinsCaption.Size = UDim2.new(1, -24, 0, 12)
coinsCaption.Position = UDim2.new(0, 14, 0, 40)

local oreLabel = label(hud, "0 / 25", 14, COL.text, true)
oreLabel.Size = UDim2.new(1, -24, 0, 16)
oreLabel.Position = UDim2.new(0, 14, 0, 60)

local barBg = Instance.new("Frame")
barBg.Size = UDim2.new(1, -28, 0, 6)
barBg.Position = UDim2.new(0, 14, 0, 80)
barBg.BackgroundColor3 = COL.panel
barBg.BorderSizePixel = 0
barBg.Parent = hud
corner(barBg, 3)

local barFill = Instance.new("Frame")
barFill.Size = UDim2.new(0, 0, 1, 0)
barFill.BackgroundColor3 = COL.good
barFill.BorderSizePixel = 0
barFill.Parent = barBg
corner(barFill, 3)

local pickLabel = label(hud, "Wooden pickaxe", 12, COL.dim)
pickLabel.Size = UDim2.new(1, -24, 0, 14)
pickLabel.Position = UDim2.new(0, 14, 0, 92)

-- bottom buttons
local bar = Instance.new("Frame")
bar.Size = UDim2.new(0, 372, 0, 46)
bar.Position = UDim2.new(0.5, -186, 1, -66)
bar.BackgroundTransparency = 1
bar.Parent = gui

local barLayout = Instance.new("UIListLayout")
barLayout.FillDirection = Enum.FillDirection.Horizontal
barLayout.Padding = UDim.new(0, 8)
barLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
barLayout.Parent = bar

local sellBtn = button(bar, "Sell", Color3.fromRGB(32, 84, 48))
sellBtn.Size = UDim2.new(0, 116, 1, 0)
local shopBtn = button(bar, "Shop")
shopBtn.Size = UDim2.new(0, 116, 1, 0)
local zonesBtn = button(bar, "Shafts")
zonesBtn.Size = UDim2.new(0, 116, 1, 0)

-- modal panel
local panel = Instance.new("Frame")
panel.Size = UDim2.new(0, 460, 0, 420)
panel.Position = UDim2.new(0.5, -230, 0.5, -210)
panel.BackgroundColor3 = COL.bg
panel.Visible = false
panel.Parent = gui
corner(panel, 14)
stroke(panel)

local panelTitle = label(panel, "Shop", 22, COL.text, true)
panelTitle.Size = UDim2.new(1, -80, 0, 30)
panelTitle.Position = UDim2.new(0, 18, 0, 14)

local closeBtn = button(panel, "X")
closeBtn.Size = UDim2.new(0, 32, 0, 32)
closeBtn.Position = UDim2.new(1, -46, 0, 13)

local list = Instance.new("ScrollingFrame")
list.Size = UDim2.new(1, -28, 1, -66)
list.Position = UDim2.new(0, 14, 0, 54)
list.BackgroundTransparency = 1
list.BorderSizePixel = 0
list.ScrollBarThickness = 4
list.CanvasSize = UDim2.new()
list.AutomaticCanvasSize = Enum.AutomaticSize.Y
list.Parent = panel

local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 8)
listLayout.SortOrder = Enum.SortOrder.LayoutOrder
listLayout.Parent = list

-- toast
local toast = Instance.new("TextLabel")
toast.Size = UDim2.new(0, 420, 0, 40)
toast.Position = UDim2.new(0.5, -210, 0, -60)
toast.BackgroundColor3 = COL.bg
toast.TextColor3 = COL.text
toast.Font = Enum.Font.GothamMedium
toast.TextSize = 15
toast.Text = ""
toast.Parent = gui
corner(toast, 10)
local toastStroke = stroke(toast, COL.accent)

local toastToken = 0
function Ui.toast(text, kind)
	toastToken = toastToken + 1
	local mine = toastToken
	toast.Text = text
	toastStroke.Color = kind == "good" and COL.good or (kind == "warn" and COL.warn or COL.accent)
	TweenService:Create(toast, TweenInfo.new(0.25), { Position = UDim2.new(0.5, -210, 0, 18) }):Play()
	task.delay(3, function()
		if toastToken ~= mine then return end
		TweenService:Create(toast, TweenInfo.new(0.25), { Position = UDim2.new(0.5, -210, 0, -60) }):Play()
	end)
end

-- ------------------------------------------------------------------ rows
local function clearList()
	for _, child in ipairs(list:GetChildren()) do
		if child:IsA("Frame") then child:Destroy() end
	end
end

local function row(order, title, subtitle, actionText, enabled, onClick)
	local frame = Instance.new("Frame")
	frame.Size = UDim2.new(1, -8, 0, 62)
	frame.BackgroundColor3 = COL.panel
	frame.LayoutOrder = order
	frame.Parent = list
	corner(frame, 10)
	stroke(frame)

	local t = label(frame, title, 16, COL.text, true)
	t.Size = UDim2.new(1, -150, 0, 20)
	t.Position = UDim2.new(0, 14, 0, 10)

	local s = label(frame, subtitle, 12.5, COL.dim)
	s.Size = UDim2.new(1, -150, 0, 16)
	s.Position = UDim2.new(0, 14, 0, 32)

	if actionText then
		local b = button(frame, actionText, enabled and Color3.fromRGB(52, 52, 62) or Color3.fromRGB(34, 34, 40))
		b.Size = UDim2.new(0, 118, 0, 34)
		b.Position = UDim2.new(1, -130, 0.5, -17)
		b.AutoButtonColor = enabled
		b.TextColor3 = enabled and COL.text or COL.dim
		if enabled and onClick then
			b.MouseButton1Click:Connect(onClick)
		end
	end
	return frame
end

local function fire(action, a, b)
	if Ui.onAction then Ui.onAction(action, a, b) end
end

-- ------------------------------------------------------------------ panels
local function buildShop()
	clearList()
	panelTitle.Text = "Shop"
	local order = 0
	local function nextOrder()
		order = order + 1
		return order
	end

	-- pickaxe
	local nextPick = state.nextPickaxe
	if nextPick then
		row(nextOrder(), "Pickaxe: " .. nextPick.name,
			("Power %d  ·  %s coins"):format(nextPick.power, Ui.short(nextPick.cost)),
			"Buy", state.coins >= nextPick.cost,
			function() fire("buy", "pickaxe", state.pickaxe + 1) end)
	else
		row(nextOrder(), "Pickaxe maxed", "You are swinging the best there is.", nil, false)
	end

	-- backpack
	local nextPack = state.nextBackpack
	if nextPack then
		row(nextOrder(), "Backpack: " .. nextPack.name,
			("Holds %d ore  ·  %s coins"):format(nextPack.capacity, Ui.short(nextPack.cost)),
			"Buy", state.coins >= nextPack.cost,
			function() fire("buy", "backpack", state.backpack + 1) end)
	else
		row(nextOrder(), "Backpack maxed", "Nothing bigger to carry ore in.", nil, false)
	end

	-- rebirth
	row(nextOrder(), ("Rebirth #%d"):format((state.rebirths or 0) + 1),
		("Reset for +%d%% sale value  ·  %s coins"):format(
			math.floor(Config.Rebirth.bonusPerRebirth * 100), Ui.short(state.rebirthCost or 0)),
		"Rebirth", (state.coins or 0) >= (state.rebirthCost or math.huge),
		function() fire("rebirth") end)

	-- passes
	for _, key in ipairs(Config.PassOrder) do
		local pass = Config.GamePasses[key]
		local owned = state.passes and state.passes[key]
		local available = pass.id ~= 0
		row(nextOrder(), pass.name,
			owned and "Owned" or (available and (pass.blurb .. "  ·  " .. pass.robux .. " R$") or (pass.blurb .. "  ·  not set up yet")),
			owned and "Owned" or "Get", (not owned) and available,
			function() fire("prompt", "pass", key) end)
	end

	-- products
	for _, key in ipairs(Config.ProductOrder) do
		local product = Config.Products[key]
		local available = product.id ~= 0
		row(nextOrder(), product.name,
			available and (product.robux .. " R$") or "not set up yet",
			"Buy", available,
			function() fire("prompt", "product", key) end)
	end
end

local function buildZones()
	clearList()
	panelTitle.Text = "Shafts"
	for index, zone in ipairs(Config.Zones) do
		local needed = Config.Pickaxes[zone.requiredPickaxe]
		local hasPick = (state.pickaxe or 1) >= zone.requiredPickaxe
		local hasVip = (not zone.vipOnly) or (state.passes and state.passes.VipZone)
		local unlocked = hasPick and hasVip

		local why
		if not hasVip then
			why = "Needs the VIP Shaft game pass"
		elseif not hasPick then
			why = ("Needs the %s pickaxe"):format(needed.name)
		else
			local names = {}
			for oreName in pairs(zone.weights) do
				table.insert(names, oreName)
			end
			table.sort(names)
			why = table.concat(names, ", ")
		end

		row(index, zone.name, why, unlocked and "Travel" or "Locked", unlocked,
			function()
				fire("teleport", index)
				Ui.close()
			end)
	end
end

function Ui.open(which)
	panel.Visible = true
	if which == "zones" then buildZones() else buildShop() end
end

function Ui.close()
	panel.Visible = false
end

function Ui.short(n)
	n = tonumber(n) or 0
	local units = { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "K" } }
	for _, unit in ipairs(units) do
		if n >= unit[1] then
			return ("%.1f%s"):format(n / unit[1], unit[2])
		end
	end
	return tostring(math.floor(n))
end

function Ui.setState(newState)
	state = newState
	coinsLabel.Text = Ui.short(state.coins)
	oreLabel.Text = ("%d / %d ore"):format(state.oreCount or 0, state.capacity or 0)
	local pct = (state.capacity or 0) > 0 and math.clamp((state.oreCount or 0) / state.capacity, 0, 1) or 0
	barFill.Size = UDim2.new(pct, 0, 1, 0)
	barFill.BackgroundColor3 = pct >= 1 and COL.warn or COL.good

	local extra = ""
	if (state.sellMultiplier or 1) > 1.001 then
		extra = ("  ·  x%.2f sale"):format(state.sellMultiplier)
	end
	pickLabel.Text = (state.pickaxeName or "Wooden") .. " pickaxe" .. extra

	if panel.Visible then
		if panelTitle.Text == "Shafts" then buildZones() else buildShop() end
	end
end

sellBtn.MouseButton1Click:Connect(function() fire("sell") end)
shopBtn.MouseButton1Click:Connect(function() Ui.open("shop") end)
zonesBtn.MouseButton1Click:Connect(function() Ui.open("zones") end)
closeBtn.MouseButton1Click:Connect(Ui.close)

return Ui
