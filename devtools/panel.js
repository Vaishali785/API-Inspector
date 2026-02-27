let devtoolsPort = null
const theme = chrome.devtools.panels.themeName
document.documentElement.dataset.theme = theme
// const SORT_MODES = {
// 	RECENT: "recent",
// 	BREAKING: "breaking",
// 	A_Z: "az",
// }
// let currentSort = SORT_MODES.RECENT

const SORT_MODES = ["recent", "breaking", "az"]
let currentSortIndex = 0
let currentSort = SORT_MODES[0]

function escapeHTML(str) {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;")
}

function showReloadNotice() {
	const container = document.getElementById("panelBody")
	if (!container) return

	container.innerHTML = `
		<div class="reload-notice">
			<h2 class="reload-title">Extension Reloaded</h2>
			<p class="reload-text">
				The extension was reloaded. Please close DevTools and reopen it.
			</p>
			<div class="reload-steps">
				<ol>
					<li>Close DevTools (this panel)</li>
					<li>Reopen DevTools (F12)</li>
					<li>Go to API Inspector tab</li>
				</ol>
			</div>
		</div>
	`
}

function connectPort() {
	try {
		devtoolsPort = chrome.runtime.connect({ name: "devtools" })
		console.log("✅ Port connected")

		// Message listener
		devtoolsPort.onMessage.addListener((msg) => {
			if (msg.type === "REGISTRY_UPDATED") {
				console.log("🔔 Registry updated notification received")
				loadRegistry()
			}

			if (msg.type === "REGISTRY_DATA") {
				console.log("📦 Registry data received")
				renderRegistry(msg.payload)
			}
		})

		// Detect context invalidation
		devtoolsPort.onDisconnect.addListener(() => {
			console.log("🔴 DevTools port disconnected!")
			showReloadNotice()
		})

		// Load initial data
		loadRegistry()
	} catch (error) {
		console.error("❌ Failed to connect port:", error)
		showReloadNotice()
	}
}
// <div style="
//     padding: 40px;
//     text-align: center;
//     background: #fff3cd;
//     border: 2px solid #ffc107;
//     border-radius: 8px;
//     margin: 20px;
// ">
//     <h2>⚠️ Extension Reloaded</h2>
//     <p>The extension was reloaded. Please close DevTools and reopen it.</p>
//     <p style="color: #666; font-size: 14px; margin-top: 20px;">
//         <strong>Steps:</strong><br>
//         1. Close DevTools (this panel)<br>
//         2. Reopen DevTools (F12)<br>
//         3. Go to API Inspector tab
//     </p>
// </div>

// Connect on load
connectPort()
// updateSortButtonLabel()

// document.getElementById("sortButton").addEventListener("change", (e) => {
// 	currentSort = e.target.value
// 	loadRegistry()
// })

function updateSortButtonLabel() {
	const labels = {
		recent: "Sort: Recent",
		breaking: "Sort: Breaking",
		az: "Sort: A-Z",
	}

	sortButton.textContent = labels[currentSort]
}

const sortButton = document.getElementById("sortButton")

sortButton.addEventListener("click", () => {
	currentSortIndex = (currentSortIndex + 1) % SORT_MODES.length
	currentSort = SORT_MODES[currentSortIndex]

	updateSortButtonLabel()
	loadRegistry()
})

function highlightSchema(schema, changes, type) {
	const json = JSON.stringify(schema, null, 2)
	const lines = json.split("\n")

	// Build a Set of field names to highlight
	const fieldsToHighlight = new Set()

	if (type === "old") {
		// Highlight removed fields
		changes?.removed?.forEach((f) => {
			fieldsToHighlight.add(f.split(".").pop())
		})
		// Highlight old type for changed fields
		changes?.typeChanged?.forEach((tc) => {
			fieldsToHighlight.add(tc.field.split(".").pop())
		})
	} else if (type === "new") {
		// Highlight added fields
		changes?.added?.forEach((f) => {
			fieldsToHighlight.add(f.split(".").pop())
		})
		// Highlight new type for changed fields
		changes?.typeChanged?.forEach((tc) => {
			fieldsToHighlight.add(tc.field.split(".").pop())
		})
	}

	let insideHighlightBlock = false
	let blockFieldName = null
	let braceDepth = 0
	let bracketDepth = 0

	return lines
		.map((line, index) => {
			const trimmed = line.trim()

			// Check if this line starts a field definition we want to highlight
			for (const fieldName of fieldsToHighlight) {
				if (trimmed.startsWith(`"${fieldName}":`)) {
					insideHighlightBlock = true
					blockFieldName = fieldName
					braceDepth = 0
					bracketDepth = 0
					break
				}
			}

			const safeLine = escapeHTML(trimmed)
			// Track depth while inside a block
			if (insideHighlightBlock) {
				// Count opening braces/brackets
				for (const char of safeLine) {
					if (char === "{") braceDepth++
					if (char === "[") bracketDepth++
					if (char === "}") braceDepth--
					if (char === "]") bracketDepth--
				}

				// Check if we've closed the block
				// A block ends when we're back at depth 0 AND the line ends with , or } or ]
				if (braceDepth === 0 && bracketDepth === 0) {
					// This is the last line of the block
					const highlightedLine =
						type === "old"
							? `<span class="diff-removed">${safeLine}</span>`
							: `<span class="diff-added">${safeLine}</span>`

					insideHighlightBlock = false
					blockFieldName = null
					return highlightedLine
				}

				// We're inside the block
				return type === "old"
					? `<span class="diff-removed">${safeLine}</span>`
					: `<span class="diff-added">${safeLine}</span>`
			}
			return safeLine
		})
		.join("\n")
}

function createApiItem(api, data, index) {
	const wrapper = document.createElement("div")
	wrapper.className = "api-item"

	const header = document.createElement("div")
	header.className = "api-header"

	const headerTitleWrap = document.createElement("div")
	headerTitleWrap.className = "api-header-title-wrap"

	const title = document.createElement("span")
	title.className = "api-header--title"
	title.textContent = api

	const indexHolder = document.createElement("span")
	indexHolder.className = "api-header--index"
	indexHolder.textContent = index + 1

	const badge = document.createElement("span")
	badge.className = `api-header--badge badge ${data.status}`
	badge.textContent = data.status

	headerTitleWrap.appendChild(indexHolder)
	headerTitleWrap.appendChild(title)
	header.appendChild(headerTitleWrap)
	header.appendChild(badge)

	const body = document.createElement("div")
	body.className = "api-body"

	const hasPendingChanges =
		data.pendingSchema !== null && data.pendingSchema !== undefined

	const hasChanges =
		data.changes &&
		(data.changes.added?.length > 0 ||
			data.changes.removed?.length > 0 ||
			data.changes.typeChanged?.length > 0)

	let changesHtml = ""

	body.innerHTML = `
    
    ${
			hasPendingChanges
				? `
        <div class="schema-comparison">
          <div class="schema-column">
            <h4>Current Schema (Saved)</h4>
            <pre>${highlightSchema(data.schema, data.changes, "old")}</pre>
          </div>
          <div class="schema-column">
            <h4>New Schema (Pending)</h4>
            <pre>${highlightSchema(data.pendingSchema, data.changes, "new")}</pre>
          </div>
        </div>
         <div class='date-display'>
            <p><strong>Created:</strong> ${new Date(data.createdAt).toLocaleString()}</p>
            <p><strong>Last Updated:</strong> ${new Date(data.lastUpdated).toLocaleString()}</p>
        </div>

        <div class="action-buttons">
          <button class="btn-approve" data-api="${escapeHTML(api)}">Update Schema </button>
        </div>
      `
				: `
        <div class="schema-display">
          <h4>Current Schema</h4>
          <pre>${escapeHTML(JSON.stringify(data.schema, null, 2))}</pre>
        </div>
       

         <div class='date-display'>
            <p><strong>Created:</strong> ${new Date(data.createdAt).toLocaleString()}</p>
            <p><strong>Last Updated:</strong> ${new Date(data.lastUpdated).toLocaleString()}</p>
        </div>
      `
		}
       
  `

	// Add event listeners for approve/reject buttons
	if (hasPendingChanges) {
		body.querySelector(".btn-approve")?.addEventListener("click", (e) => {
			const api = e.target.dataset.api
			approveChanges(api)
		})

		body.querySelector(".btn-reject")?.addEventListener("click", (e) => {
			const api = e.target.dataset.api
			rejectChanges(api)
		})
	}

	header.addEventListener("click", () => {
		body.style.display = body.style.display === "block" ? "none" : "block"
	})

	wrapper.appendChild(header)
	wrapper.appendChild(body)

	return wrapper
}

function approveChanges(api) {
	chrome.devtools.inspectedWindow.eval("window.location.origin", (origin) => {
		chrome.runtime.sendMessage(
			{
				type: "APPROVE_CHANGES",
				payload: { api, origin }, // ⬅️ Add origin
			},
			(response) => {
				if (response && response.success) {
					loadRegistry()
				} else {
					console.error("Failed to approve changes:", response?.error)
				}
			},
		)
	})
}

function rejectChanges(api) {
	chrome.runtime.sendMessage(
		{
			type: "REJECT_CHANGES",
			payload: { api },
		},
		(response) => {
			if (response && response.success) {
				loadRegistry() // Refresh the UI
			} else {
				console.error("Failed to reject changes:", response?.error)
			}
		},
	)
}

function sortRegistryEntries(entries, sortMode) {
	const statusRank = {
		breaking: 0,
		minor: 1,
		new: 2,
		unchanged: 3,
	}
	const sorted = [...entries]
	switch (sortMode) {
		// case SORT_MODES.BREAKING:
		case "breaking":
			return entries.sort((a, b) => {
				const sa = statusRank[a[1].status] ?? 99
				const sb = statusRank[b[1].status] ?? 99
				if (sa !== sb) return sa - sb
				return (b[1].lastUpdated || 0) - (a[1].lastUpdated || 0)
			})

		// case SORT_MODES.A_Z:
		case "az":
			return entries.sort((a, b) => a[0].localeCompare(b[0]))

		// case SORT_MODES.RECENT:
		case "recent":
		default:
			return entries.sort(
				(a, b) => (b[1].lastUpdated || 0) - (a[1].lastUpdated || 0),
			)
	}
}

function renderRegistry(registry) {
	const container = document.getElementById("output")

	if (!container) {
		console.error("Output container not found")
		return
	}

	container.innerHTML = ""

	// const entries = Object.entries(registry)

	let entries = Object.entries(registry)
	entries = sortRegistryEntries(entries, currentSort)

	if (entries.length === 0) {
		container.innerHTML =
			"<p class='empty-state'>No APIs tracked yet. Navigate to a page with API calls to start monitoring.</p>"
		return
	}

	entries.forEach(([api, data], index) => {
		container.appendChild(createApiItem(api, data, index))
	})
}

function loadRegistry() {
	// Get current page origin
	chrome.devtools.inspectedWindow.eval("window.location.origin", (origin) => {
		devtoolsPort.postMessage({
			type: "GET_REGISTRY",
			payload: { origin },
		})
	})
}

// Load on page load
// document.addEventListener("DOMContentLoaded", loadRegistry)

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "local" && changes.apiRegistry) {
		console.log("Registry updated, refreshing...")
		loadRegistry()
	}
})
