let apiRegistry = {}
let currentOrigin = null

let devtoolsPort = null

chrome.runtime.onConnect.addListener((port) => {
	if (port.name === "devtools") {
		devtoolsPort = port
		console.log("DevTools connected")

		port.onMessage.addListener((msg) => {
			if (msg.type === "GET_REGISTRY") {
				const { origin } = msg.payload || {}
				const storageKey = `apiRegistry_${origin}`

				chrome.storage.local.get([storageKey], (result) => {
					port.postMessage({
						type: "REGISTRY_DATA",
						payload: result[storageKey] || {},
					})
				})
			}
		})

		port.onDisconnect.addListener(() => {
			console.log("DevTools disconnected")
			devtoolsPort = null
		})
	}
})

//  ORIGIN fetched by content.js
chrome.runtime.onMessage.addListener((msg) => {
	if (msg.type === "PAGE_ORIGIN") {
		currentOrigin = msg.origin
		loadFromStorage()
	}
})

function loadFromStorage() {
	return new Promise((resolve) => {
		const storageKey = `apiRegistry_${currentOrigin}`
		chrome.storage.local.get([storageKey], (result) => {
			if (result[storageKey]) {
				apiRegistry = result[storageKey]
			}
			resolve()
		})
	})
}

// ---------- SAVE TO STORAGE ----------
function saveToStorage(origin) {
	if (!origin) {
		console.warn("Skipping save: origin not set")
		return
	}
	const storageKey = `apiRegistry_${origin}`
	chrome.storage.local.set({ [storageKey]: apiRegistry }, () => {
		console.log("Saved to storage:")
	})
}

// ---------- FLATTEN ----------
function flattenSchema(schema, prefix = "", result = {}) {
	for (const key in schema) {
		const value = schema[key]
		const newKey = prefix ? `${prefix}.${key}` : key

		if (typeof value === "object" && value !== null && !Array.isArray(value)) {
			flattenSchema(value, newKey, result)
		} else if (Array.isArray(value)) {
			// For arrays, we need to check if it's empty or has items
			if (value.length > 0) {
				// Check if first item is object, array, or primitive
				if (typeof value[0] === "object" && value[0] !== null) {
					result[newKey] = "array<object>"
					// Flatten the object structure within array
					flattenSchema(value[0], `${newKey}[]`, result)
				} else if (Array.isArray(value[0])) {
					result[newKey] = "array<array>"
				} else {
					result[newKey] = `array<${typeof value[0]}>`
				}
			} else {
				result[newKey] = "array<empty>"
			}
		} else {
			result[newKey] = typeof value
		}
	}
	return result
}

// ---------- COMPARE ----------
function compareSchemas(oldSchema, newSchema) {
	const oldFlat = flattenSchema(oldSchema)
	const newFlat = flattenSchema(newSchema)

	const added = []
	const removed = []
	const typeChanged = []

	// console.log("Flattened OLD:", oldFlat)
	// console.log("Flattened NEW:", newFlat)

	for (const key in newFlat) {
		if (!(key in oldFlat)) {
			added.push(key)
		} else if (oldFlat[key] !== newFlat[key]) {
			typeChanged.push({
				field: key,
				oldType: oldFlat[key],
				newType: newFlat[key],
			})
		}
	}

	for (const key in oldFlat) {
		if (!(key in newFlat)) {
			removed.push(key)
		}
	}

	return { added, removed, typeChanged }
}

function calculateStatus(diff) {
	if (diff.typeChanged.length > 0 || diff.removed.length > 0) {
		return "breaking"
	}

	if (diff.added.length > 0) {
		return "minor"
	}

	return "unchanged"
}

// ---------- MESSAGE LISTENER ----------
chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
	// if (currentOrigin !== origin) {
	// 	currentOrigin = origin
	// 	await loadFromStorage()
	// }
	if (msg.type === "NEW_SCHEMA") {
		const { api, schema, origin } = msg.payload
		const now = Date.now()
		const storageKey = `apiRegistry_${origin}`

		// Load registry for this specific origin
		chrome.storage.local.get([storageKey], (result) => {
			apiRegistry = result[storageKey] || {}

			const existing = apiRegistry[api]

			if (!existing) {
				// New API detected
				apiRegistry[api] = {
					schema,
					createdAt: now,
					lastUpdated: now,
					status: "new",
					changes: { added: [], removed: [], typeChanged: [] },
					pendingSchema: null,
				}

				console.log("New API registered:")
				saveToStorage(origin)
				if (devtoolsPort) {
					devtoolsPort.postMessage({ type: "REGISTRY_UPDATED" })
				}
				return
			}

			// Compare with CURRENT saved schema (not pending)
			const diff = compareSchemas(existing.schema, schema)
			const status = calculateStatus(diff)

			if (status === "unchanged") {
				apiRegistry[api] = {
					...existing,
					lastUpdated: now,
					status: "unchanged",
					changes: { added: [], removed: [], typeChanged: [] },
					pendingSchema: null,
				}
				saveToStorage(origin)
			} else {
				apiRegistry[api] = {
					...existing,
					lastUpdated: now,
					status,
					changes: diff,
					pendingSchema: schema,
				}
				saveToStorage(origin)
			}

			if (devtoolsPort) {
				devtoolsPort.postMessage({ type: "REGISTRY_UPDATED" })
			}
			sendResponse({ success: true, status })
		}) // ⬅️ THIS CLOSING BRACKET FOR chrome.storage.local.get

		return true
	}

	if (msg.type === "APPROVE_CHANGES") {
		const { api, origin } = msg.payload

		if (!origin) {
			sendResponse({ success: false, error: "No origin provided" })
			return true
		}

		const storageKey = `apiRegistry_${origin}`
		chrome.storage.local.get([storageKey], (result) => {
			apiRegistry = result[storageKey] || {}

			if (apiRegistry[api] && apiRegistry[api].pendingSchema) {
				apiRegistry[api] = {
					...apiRegistry[api],
					schema: apiRegistry[api].pendingSchema,
					pendingSchema: null,
					status: "unchanged",
					changes: { added: [], removed: [], typeChanged: [] },
					lastUpdated: Date.now(),
				}

				saveToStorage(origin) // ⬅️ Pass origin
				if (devtoolsPort) {
					devtoolsPort.postMessage({ type: "REGISTRY_UPDATED" })
				}
				sendResponse({ success: true })
			} else {
				sendResponse({ success: false, error: "No pending changes" })
			}
		})

		return true
	}

	return true
})
