// Converts similar calls with dfferent params to one call
function normalizeApiKey(url) {
	try {
		const u = new URL(url)
		// Common pagination/cursor parameters to ignore
		const ignoredParams = [
			"page",
			"pageSize",
			"limit",
			"offset",
			"cursor",
			"skip",
			"take",
			"per_page",
			"perPage",
			"count",
			"size",
			// Add more as needed
		]
		// Get all params except ignored ones
		const params = new URLSearchParams(u.search)
		const relevantParams = []

		for (const [key, value] of params.entries()) {
			// Case-insensitive check
			if (
				!ignoredParams.some((ignored) =>
					key.toLowerCase().includes(ignored.toLowerCase()),
				)
			) {
				relevantParams.push(`${key}=${value}`)
			}
		}

		// Build normalized URL
		const paramString =
			relevantParams.length > 0 ? `?${relevantParams.sort().join("&")}` : ""
		return `${u.origin}${u.pathname}${paramString}`
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
chrome.devtools.panels.create("API Inspector", "", "./devtools/panel.html")

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

function loadSettings(origin) {
	const settingsKey = `apiSettings_${origin}`

	chrome.storage.local.get([settingsKey], (result) => {
		const settings = result[settingsKey]

		if (settings) {
			apiPatterns = settings.apiPatterns
			trackAllJSON = settings.trackAllJSON
		}
	})
}

// Listen for settings changes
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "local") {
		//  Check if any domain's settings changed
		for (const key in changes) {
			if (key.startsWith("apiSettings_")) {
				const changedOrigin = key.replace("apiSettings_", "")

				// Only update if it's for current page
				chrome.devtools.inspectedWindow.eval(
					"window.location.origin",
					(currentOrigin) => {
						if (changedOrigin === currentOrigin) {
							const newSettings = changes[key].newValue
							apiPatterns = newSettings.apiPatterns || ["/api/"]
							trackAllJSON = newSettings.trackAllJSON || false
						}
					},
				)
			}
		}
	}
})

// Listen to network calls
chrome.devtools.inspectedWindow.eval("window.location.origin", (origin) => {
	// Load settings for this domain
	loadSettings(origin)

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

		if (!status || status < 200 || status >= 300) return

		if (!isJson) return

		if (shouldTrack && !failedStatus) {
			// Filter: only track APIs from the same origin

			const apiOrigin = new URL(url).origin
			const referer = getHeader(networkReq.request.headers, "referer")
			const isReferrer = referer && referer.startsWith(origin)
			if (apiOrigin !== origin && !isReferrer) return

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
