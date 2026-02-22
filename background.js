let apiRegistry = {}

// ---------- LOAD FROM STORAGE ON START ----------
chrome.runtime.onInstalled.addListener(loadFromStorage)
chrome.runtime.onStartup.addListener(loadFromStorage)
chrome.runtime.onConnect.addListener((port) => {
	if (port.name === "devtools") {
		port.onDisconnect.addListener(() => {
			console.log("Port disconnected")
		})
	}
})

function loadFromStorage() {
	return new Promise((resolve) => {
		chrome.storage.local.get(["apiRegistry"], (result) => {
			if (result.apiRegistry) {
				apiRegistry = result.apiRegistry
				console.log("Loaded registry from storage:", apiRegistry)
			}
			resolve()
		})
	})
}

// Initialize on script load
loadFromStorage()

// ---------- SAVE TO STORAGE ----------
function saveToStorage() {
	chrome.storage.local.set({ apiRegistry }, () => {
		console.log("Saved to storage:", apiRegistry)
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

	console.log("Flattened OLD:", oldFlat)
	console.log("Flattened NEW:", newFlat)

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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg.type === "NEW_SCHEMA") {
		const { api, schema } = msg.payload
		const now = Date.now()

		const existing = apiRegistry[api]

		if (!existing) {
			// New API detected
			apiRegistry[api] = {
				schema,
				createdAt: now,
				lastUpdated: now,
				status: "new",
				changes: { added: [], removed: [], typeChanged: [] },
				pendingSchema: null, // No pending changes for new APIs
			}

			console.log("New API registered:", api)
			saveToStorage()
			sendResponse({ success: true, status: "new" })
			return true
		}

		// Compare with CURRENT saved schema (not pending)
		console.log("Comparing schemas for:", api)
		const diff = compareSchemas(existing.schema, schema)
		const status = calculateStatus(diff)

		console.log("Diff:", diff)
		console.log("Status:", status)

		if (status === "unchanged") {
			// No changes detected, just update lastUpdated
			apiRegistry[api] = {
				...existing,
				lastUpdated: now,
				status: "unchanged",
				changes: { added: [], removed: [], typeChanged: [] },
				pendingSchema: null,
			}
			saveToStorage()
		} else {
			// Changes detected - store as pending, don't update main schema yet
			apiRegistry[api] = {
				...existing,
				lastUpdated: now,
				status,
				changes: diff,
				pendingSchema: schema, // Store the new schema as pending
			}
			saveToStorage()
		}

		sendResponse({ success: true, status })
		return true
	}

	if (msg.type === "GET_REGISTRY") {
		console.log("Sending registry:", apiRegistry)
		sendResponse(apiRegistry)
		return true
	}

	if (msg.type === "APPROVE_CHANGES") {
		const { api } = msg.payload

		if (apiRegistry[api] && apiRegistry[api].pendingSchema) {
			// Update the schema with pending changes
			apiRegistry[api] = {
				...apiRegistry[api],
				schema: apiRegistry[api].pendingSchema,
				pendingSchema: null,
				status: "unchanged",
				changes: { added: [], removed: [], typeChanged: [] },
				lastUpdated: Date.now(),
			}

			saveToStorage()
			sendResponse({ success: true })
		} else {
			sendResponse({ success: false, error: "No pending changes" })
		}
		return true
	}

	if (msg.type === "REJECT_CHANGES") {
		const { api } = msg.payload

		if (apiRegistry[api] && apiRegistry[api].pendingSchema) {
			// Clear pending changes, keep old schema
			apiRegistry[api] = {
				...apiRegistry[api],
				pendingSchema: null,
				status: "unchanged",
				changes: { added: [], removed: [], typeChanged: [] },
				lastUpdated: Date.now(),
			}

			saveToStorage()
			sendResponse({ success: true })
		} else {
			sendResponse({ success: false, error: "No pending changes" })
		}
		return true
	}

	return true
})
