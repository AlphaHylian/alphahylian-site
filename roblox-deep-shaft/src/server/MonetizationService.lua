-- Game passes and developer products.
--
-- ProcessReceipt is the one callback Roblox will retry until it is told the
-- purchase was granted, so it has to be idempotent: the receipt id is recorded
-- in the player's saved data and a repeat of the same id is acknowledged
-- without granting anything twice.

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Net = require(ReplicatedStorage.Shared.Net)
local DataService = require(script.Parent.DataService)
local EconomyService = require(script.Parent.EconomyService)

local MonetizationService = {}

local productById = {}   -- productId -> config key
local passByAssetId = {}     -- gamePassId -> config key

local function indexIds()
	for key, product in pairs(Config.Products) do
		if product.id and product.id ~= 0 then
			productById[product.id] = key
		end
	end
	for key, pass in pairs(Config.GamePasses) do
		if pass.id and pass.id ~= 0 then
			passByAssetId[pass.id] = key
		end
	end
end

function MonetizationService.refreshPasses(player)
	local data = DataService.get(player)
	if not data then return end
	for key, pass in pairs(Config.GamePasses) do
		if pass.id and pass.id ~= 0 then
			local ok, owns = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, pass.id)
			end)
			if ok then
				data.passes[key] = owns or nil
			end
		end
	end
	EconomyService.pushState(player)
end

local function grant(player, key)
	local product = Config.Products[key]
	if not product then return false end
	local data = DataService.get(player)
	if not data then return false end

	local g = product.grant
	if g.coins then
		data.coins = data.coins + g.coins
		EconomyService.updateLeaderstats(player)
	end
	if g.boostSeconds then
		local base = math.max(os.time(), data.boostUntil or 0)
		data.boostUntil = base + g.boostSeconds
		data.boostMult = g.boostMult or 2
	end
	EconomyService.pushState(player)
	EconomyService.notify(player, ("Thanks! %s applied."):format(product.name), "good")
	return true
end

function MonetizationService.start()
	indexIds()

	MarketplaceService.ProcessReceipt = function(receipt)
		local player = Players:GetPlayerByUserId(receipt.PlayerId)
		if not player then
			-- they left before it landed; Roblox will retry when they return
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		local data = DataService.get(player)
		if not data then
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		local receiptKey = tostring(receipt.PurchaseId)
		if data.receipts[receiptKey] then
			-- already handled, just stop Roblox retrying
			return Enum.ProductPurchaseDecision.PurchaseGranted
		end

		local key = productById[receipt.ProductId]
		if not key then
			warn("[DeepShaft] unknown product id " .. tostring(receipt.ProductId))
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		local ok, granted = pcall(grant, player, key)
		if not (ok and granted) then
			warn("[DeepShaft] failed to grant " .. key)
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		data.receipts[receiptKey] = true
		-- persist immediately so a server crash can't lose a paid purchase
		DataService.save(player)
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, wasPurchased)
		if not wasPurchased then return end
		local key = passByAssetId[passId]
		if not key then return end
		local data = DataService.get(player)
		if not data then return end
		data.passes[key] = true
		EconomyService.pushState(player)
		EconomyService.notify(player, ("%s unlocked!"):format(Config.GamePasses[key].name), "good")
	end)

	Net.Event.PromptPurchase.OnServerEvent:Connect(function(player, kind, key)
		if kind == "pass" then
			local pass = Config.GamePasses[key]
			if pass and pass.id ~= 0 then
				MarketplaceService:PromptGamePassPurchase(player, pass.id)
			else
				EconomyService.notify(player, "That pass isn't set up yet.", "warn")
			end
		elseif kind == "product" then
			local product = Config.Products[key]
			if product and product.id ~= 0 then
				MarketplaceService:PromptProductPurchase(player, product.id)
			else
				EconomyService.notify(player, "That item isn't set up yet.", "warn")
			end
		end
	end)
end

return MonetizationService
