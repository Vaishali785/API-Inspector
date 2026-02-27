/* ================================
   GLOBAL STATE (MV3-safe)
================================ */

let devtoolsPort = null

// Queue for API updates
const apiUpdateQueue = []
let isProcessingQueue = false

/* ================================
   DEVTOOLS CONNECTION
================================ */

chrome.runtime.onConnect.addListener((port) => {
	if (port.name !== "devtools") return

	devtoolsPort = port
	console.log("[BG] DevTools connected")

	port.onDisconnect.addListener(() => {
		console.log("[BG] DevTools disconnected")
		devtoolsPort = null
	})

	port.onMessage.addListener((msg) => {
		if (msg.type === "GET_REGISTRY") {
			const { origin } = msg.payload || {}
			if (!origin) return

			const storageKey = `apiRegistry_${origin}`
			chrome.storage.local.get([storageKey], (result) => {
				port.postMessage({
					type: "REGISTRY_DATA",
					payload: result[storageKey] || {},
				})
			})
		}
	})
})

/* ================================
   MESSAGE ENTRY POINT
================================ */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg.type === "NEW_SCHEMA") {
		const { api, schema, origin } = msg.payload

		enqueueApiUpdate({
			api,
			schema,
			origin,
			timestamp: Date.now(),
		})

		return true
	}

	if (msg.type === "APPROVE_CHANGES") {
		const { api, origin } = msg.payload
		if (!api || !origin) {
			sendResponse({ success: false, error: "Invalid payload" })
			return true
		}

		enqueueApiUpdate({
			api,
			origin,
			approve: true,
			timestamp: Date.now(),
		})

		sendResponse({ success: true })
		return true
	}

	if (msg.type === "CLEAR_SITE_APIS") {
		const { origin } = msg.payload
		const storageKey = `apiRegistry_${origin}`
		const storageSettingsKey = `apiSettings_${origin}`

		chrome.storage.local.remove([storageKey, storageSettingsKey], () => {
			// devtoolsPort?.postMessage({ type: "REGISTRY_UPDATED" })

			// Notify panel safely
			devtoolsPort?.postMessage({ type: "REGISTRY_UPDATED" })
			sendResponse({ success: true })
		})

		return true
	}
	return false
})

/* ================================
   QUEUE MANAGEMENT
================================ */

function enqueueApiUpdate(update) {
	apiUpdateQueue.push(update)
	processApiQueue()
}

function processApiQueue() {
	if (isProcessingQueue) return
	if (apiUpdateQueue.length === 0) return

	isProcessingQueue = true
	const next = apiUpdateQueue.shift()

	persistApiUpdate(next, () => {
		isProcessingQueue = false
		processApiQueue()
	})
}

/* ================================
   STORAGE (SINGLE SOURCE OF TRUTH)
================================ */

function persistApiUpdate(update, done) {
	const { api, schema, origin, approve, timestamp } = update
	const storageKey = `apiRegistry_${origin}`

	chrome.storage.local.get([storageKey], (result) => {
		const registry = result[storageKey] || {}
		const existing = registry[api]

		let nextEntry = existing

		// ---- APPROVE CHANGES ----
		if (approve && existing?.pendingSchema) {
			nextEntry = {
				...existing,
				schema: existing.pendingSchema,
				pendingSchema: null,
				status: "unchanged",
				changes: { added: [], removed: [], typeChanged: [] },
				lastUpdated: timestamp,
			}
		}

		// ---- NEW / UPDATE SCHEMA ----
		if (!approve && schema) {
			if (!existing) {
				nextEntry = {
					schema,
					createdAt: timestamp,
					lastUpdated: timestamp,
					status: "new",
					changes: { added: [], removed: [], typeChanged: [] },
					pendingSchema: null,
				}
			} else {
				const diff = compareSchemas(existing.schema, schema)
				const status = calculateStatus(diff)

				if (status === "unchanged") {
					nextEntry = {
						...existing,
						lastUpdated: timestamp,
						status: "unchanged",
						changes: { added: [], removed: [], typeChanged: [] },
						pendingSchema: null,
					}
				} else {
					nextEntry = {
						...existing,
						lastUpdated: timestamp,
						status,
						changes: diff,
						pendingSchema: schema,
					}
				}
			}
		}

		if (!nextEntry) {
			done()
			return
		}

		registry[api] = nextEntry

		chrome.storage.local.set({ [storageKey]: registry }, () => {
			if (chrome.runtime.lastError) {
				console.error("[BG] Storage error:", chrome.runtime.lastError.message)
			} else {
				devtoolsPort?.postMessage({ type: "REGISTRY_UPDATED" })
			}

			done()
		})
	})
}

/* ================================
   SCHEMA UTILITIES
================================ */

function flattenSchema(schema, prefix = "", result = {}) {
	for (const key in schema) {
		const value = schema[key]
		const newKey = prefix ? `${prefix}.${key}` : key

		if (Array.isArray(value)) {
			if (value.length > 0 && typeof value[0] === "object") {
				result[newKey] = "array<object>"
				flattenSchema(value[0], `${newKey}[]`, result)
			} else {
				result[newKey] = `array<${typeof value[0]}>`
			}
		} else if (typeof value === "object" && value !== null) {
			flattenSchema(value, newKey, result)
		} else {
			result[newKey] = typeof value
		}
	}
	return result
}

function compareSchemas(oldSchema, newSchema) {
	const oldFlat = flattenSchema(oldSchema)
	const newFlat = flattenSchema(newSchema)

	const added = []
	const removed = []
	const typeChanged = []

	for (const key in newFlat) {
		if (!(key in oldFlat)) added.push(key)
		else if (oldFlat[key] !== newFlat[key]) {
			typeChanged.push({
				field: key,
				oldType: oldFlat[key],
				newType: newFlat[key],
			})
		}
	}

	for (const key in oldFlat) {
		if (!(key in newFlat)) removed.push(key)
	}

	return { added, removed, typeChanged }
}

function calculateStatus(diff) {
	if (diff.removed.length || diff.typeChanged.length) return "breaking"
	if (diff.added.length) return "minor"
	return "unchanged"
}
