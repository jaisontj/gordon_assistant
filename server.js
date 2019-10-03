require('dotenv').config();
var express = require('express')
var app = express()
var bodyParser = require('body-parser')
const axios = require('axios')

const HTTP_API = process.env.BOT_HTTP_API

const SUPER_USER_USERNAME = 'FlashGordon10'

const markets = {
	"BTC": {
		pip: 0.01,
		leverage: {
			"1x": 84.85,
			"5x": 16.85,
			"10x": 8.35,
			"25x": 3.25,
			"50x": 1.55,
			"75x": 0.98,
			"100x": 0.70
		}
	},
	"ETH": {
		pip: 0.01,
		leverage: {
			"1x": 84.69,
			"5x": 16.69,
			"10x": 8.19,
			"20x": 3.94,
			"30x": 2.53,
			"40x": 1.82,
			"50x": 1.39
		}
	}, 
	"LTC": {
		pip: 0.01,
		leverage: {
			"1x": 84.61,
			"3x": 27.94,
			"5x": 16.61,
			"10x": 8.11,
			"20x": 3.86,
			"30x": 2.44,
			"40x": 1.73 
		}
	}, 
	"XRP": {
		pip: 0.0001,
		leverage: {
			"1x": 84.61,
			"3x": 27.94,
			"5x": 16.61,
			"10x": 8.11,
			"15x": 5.27,
			"20x": 3.86,
			"30x": 2.44,
		}
	}
};

// for parsing application/json
app.use(bodyParser.json()) 
// for parsing application/x-www-form-urlencoded
app.use(
	bodyParser.urlencoded({
		extended: true
	})
) 

function postToBot(method, message, res) {
	axios.post(`https://api.telegram.org/bot${HTTP_API}/${method}`, message)
		.then(response => {
			if (!res) return
			res.end('ok')
		})
		.catch(err => {
			console.log('Error :', err)
			if (!res) return
			res.end('Error :' + err)
		})
}

function sendMessage(message, res) {
	postToBot("sendMessage", message, res)
}

function welcomeUser(chatId, username, res) {
	message = {
		chat_id: chatId,
		text: `
Hi ${username}! This bot will notify you with positions to take as and when
@FlashGordon10 takes trades. Moreover, you will also be provided with limit orders to 
put in to mitigate risk and exit with profits :). 

For now, this is all. You will be notified when a position needs to be taken!
`
	}
	sendMessage(message, res)
}

function sendFunctionUnknownMessage(chatId, res) {
	message = {
		chat_id: chatId,
		text: `I do not understand what you mean.`
	}
	sendMessage(message, res)
}

function sendHelpMessage(chatId, res) {
	message = {
		chat_id: chatId,
		text: getHelpText()
	}
	sendMessage(message, res)
}

function sendLimitOrdersMessage(chatId, orders, res) {
	msg = orders.map((order, i) => {
		const { direction, market, leverage, price, amount } = order
		return `${i+1}. ${direction} ${market} ${leverage} ${price} ${amount}`
	}).join('\n')
	message = {
		chat_id: chatId, 
		text: msg
	}
	sendMessage(message, res)
}

function validateAndParseOrderMessage(message, type) {
	const strs = message.split(" ")
	if (strs.length < 5) {
		return null
	}
	// take out the leading /
	const direction = strs[0].toLowerCase().substring(1)
	if (direction !== type) {
		return null
	}
	const market = strs[1].toUpperCase()
	if (!markets.hasOwnProperty(market)) {
		return null
	}
	const availableLeverage = markets[market].leverage
	const leverage = strs[2].toLowerCase()
	if (!availableLeverage.hasOwnProperty(leverage)) {
		return null
	}
	const price = parseFloat(strs[3])
	if (isNaN(price)) {
		return null
	}
	const amount = parseFloat(strs[4])
	if (isNaN(amount)) {
		return null
	}
	return {
		direction: direction,
		market: market,
		leverage: leverage,
		price: price,
		amount: amount,
		count: 5
	}
}

function getLimit(market, direction, leverage, price) {
	const liquidationPercentage = markets[market]["leverage"][leverage]
	const decimalPlaces = market === 'XRP' ? 4 : 2
	const liquidationPrice = direction === 'long' ? (1 - liquidationPercentage/100) * price : (1 + liquidationPercentage/100) * price
	const twoPips = 2 * markets[market]["pip"]
	const limitPrice = direction === 'long' ? liquidationPrice + twoPips : liquidationPrice - twoPips
	return +limitPrice.toFixed(decimalPlaces)
}

function getLimitOrdersFromPosition(orderDetails) {
	const orders = []
	var newOrder = orderDetails
	var avgPrice = orderDetails.price
	for (var i = 0; i < orderDetails.count; i++) {
		const { market, direction, leverage, price, amount, count } = newOrder
		const newPrice = getLimit(market, direction, leverage, avgPrice)
		newOrder = {
			direction: direction,
			market: market,
			leverage: leverage,
			price: newPrice,
			amount: amount
		}
		orders.push(newOrder)
		avgPrice = (avgPrice + newPrice)/2
	}
	return orders
}

function handleNewPosition(chatId, message, isSuperUser, direction, res) {
	const orderDetails = validateAndParseOrderMessage(message, direction)
	if (!orderDetails) {
		console.log("order details is null")
		if (isSuperUser) {
			sendHelpMessage(chatId, res)
		} else {
			sendFunctionUnknownMessage(chatId, res)
		}
		return
	}
	sendLimitOrdersMessage(chatId, getLimitOrdersFromPosition(orderDetails), res)
}

function handleMessage(message, res) {
	// const isSuperUser = message.from.username == SUPER_USER_USERNAME
	const isSuperUser = true 
	if (message.text === '/start') {
		if (!isSuperUser) {
			welcomeUser(message.chat.id, message.chat.username, res)
		} else {
			welcomeSuperUser(message.chat.id, message.chat.username, res)
		}
	} else if (message.text.indexOf('/long') >= 0) {
		handleNewPosition(message.chat.id, message.text, isSuperUser, 'long', res)
	} else if (message.text.indexOf('/short') >= 0) {
		handleNewPosition(message.chat.id, message.text, isSuperUser, 'short', res)
	} else {
		//If not recognised, ignore for now.
		sendFunctionUnknownMessage(message.chat.id, res)
	}
}

function getHelpText() {
	return `
The format is as follows: 
/[direction] [market] [leverage] [price] [amount]
For example:
If you want to go long on BTC/USD at 10x @8100 for an amount of 0.01 btc, you would send: 

/long btc 10x 8100 0.01

Similarly, a short would look like so:

/short btc 50x 8400 0.001

Markets supported: btc eth ltc xrp 
Note: Ensure that the leverage amounts you enter are the ones supported by bitseven
	`
}

function welcomeSuperUser(chatId, username, res) {
	message = {
		chat_id: chatId,
		text: `
Hello ${username}!
${getHelpText()}
Let the trading begin!
`
	}
	sendMessage(message, res)
}

// A message to the bot by a user hits this API
app.post('/new-message', function(req, res) {
	const body = req.body
	console.log(JSON.stringify(body, null, 2))
	const message = body.message
	if (message != null) {
		handleMessage(message, res)
		return
	}
	const callbackQuery = body.callback_query
	if (callbackQuery != null) {
		handleCallbackQuery(callbackQuery, res)
		return
	}
})

// Finally, start our server
app.listen(process.env.PORT, function() {
	console.log(`Bot server listening on port ${process.env.PORT}!`)
})
