// Converts similar calls with dfferent params to one call
function normalizeApiKey(url) {
	try {
		const u = new URL(url)
		return `${u.origin}${u.pathname}`
	} catch (e) {
		return url // fallback if URL parsing fails
	}
}

function getHeader(headers, name) {
	return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value
}

// To remove devtools disconnected error
const port = chrome.runtime.connect({ name: "devtools" })
port.onDisconnect.addListener(() => {
	console.log("DevTools disconnected")
})

// Create custom panel
chrome.devtools.panels.create("API Inspector", "", "devtools/panel.html")

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

// Load settings
let apiPatterns = ["/api/", "/projects"] // defaults
let trackAllJSON = false

chrome.storage.local.get(["apiPatterns", "trackAllJSON"], (result) => {
	if (result.apiPatterns && result.apiPatterns.length > 0) {
		apiPatterns = result.apiPatterns
	}
	trackAllJSON = result.trackAllJSON || false
	console.log("Loaded API patterns:", apiPatterns, "Track all:", trackAllJSON)
})

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "local") {
		if (changes.apiPatterns) {
			apiPatterns = changes.apiPatterns.newValue || ["/api/"]
			console.log("Updated API patterns:", apiPatterns)
		}
		if (changes.trackAllJSON) {
			trackAllJSON = changes.trackAllJSON.newValue || false
			console.log("Updated track all:", trackAllJSON)
		}
	}
})

// Listen to network calls
chrome.devtools.inspectedWindow.eval("window.location.origin", (origin) => {
	chrome.devtools.network.onRequestFinished.addListener((networkReq) => {
		const url = networkReq.request.url

		// Only track API calls (customize this condition if needed)
		if (!url.includes("http")) return

		const isJson =
			networkReq.response.content.mimeType.includes("application/json")
		if (!isJson) return

		// Check if we should track this API
		const shouldTrack =
			trackAllJSON || apiPatterns.some((pattern) => url.includes(pattern))
		const status = networkReq.response?.status

		const failedStatus = !status || status < 200 || status >= 300
		if (shouldTrack && !failedStatus) {
			// Filter: only track APIs from the same origin

			const apiOrigin = new URL(url).origin
			const referer = getHeader(networkReq.request.headers, "referer")
			const isReferrer = referer && referer.startsWith(origin)
			if (apiOrigin !== origin && !isReferrer) {
				console.log("❌ Skipping external API:", url)
				return
			}
			networkReq.getContent((body) => {
				try {
					const parsed = JSON.parse(body)
					const schema = generateSchema(parsed)

					chrome.runtime.sendMessage({
						type: "NEW_SCHEMA",
						payload: {
							api: url,
							schema,
							origin,
						},
					})
				} catch (err) {
					console.error("Error parsing JSON:", err)
				}
			})
		}
	})
})
