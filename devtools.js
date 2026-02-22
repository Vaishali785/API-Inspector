// To remove devtools disconnected error
const port = chrome.runtime.connect({ name: "devtools" })
port.onDisconnect.addListener(() => {
	console.log("DevTools disconnected")
})

// Create custom panel
chrome.devtools.panels.create("API Inspector", "", "panel.html")

// Generate schema recursively
function generateSchema(obj) {
	if (obj === null) return "null"

	if (Array.isArray(obj)) {
		return obj.length > 0 ? [generateSchema(obj[0])] : []
	}

	if (typeof obj === "object") {
		const schema = {}
		for (const key in obj) {
			schema[key] = generateSchema(obj[key])
		}
		return schema
	}

	return typeof obj
}

// Listen to network calls
chrome.devtools.network.onRequestFinished.addListener((networkReq) => {
	const url = networkReq.request.url

	// Only track API calls (customize this condition if needed)
	if (!url.includes("http")) return

	const isBackend = url.includes("/api/") || url.includes("/projects")
	const isJson =
		networkReq.response.content.mimeType.includes("application/json")

	if (isBackend && isJson) {
		networkReq.getContent((body) => {
			try {
				const parsed = JSON.parse(body)
				const schema = generateSchema(parsed)

				console.log("Sending schema for:", url)
				console.log("Schema:", schema)

				chrome.runtime.sendMessage(
					{
						type: "NEW_SCHEMA",
						payload: {
							api: url,
							schema,
						},
					},
					(response) => {
						if (chrome.runtime.lastError) {
							console.error("Error sending message:", chrome.runtime.lastError)
						} else {
							console.log("Schema sent successfully:", response)
						}
					},
				)
			} catch (err) {
				console.error("Error parsing JSON:", err)
			}
		})
	}
})
