const theme = chrome.devtools.panels.themeName
document.documentElement.dataset.theme = theme

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

			// Track depth while inside a block
			if (insideHighlightBlock) {
				// Count opening braces/brackets
				for (const char of line) {
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
							? `<span class="diff-removed">${line}</span>`
							: `<span class="diff-added">${line}</span>`

					insideHighlightBlock = false
					blockFieldName = null
					return highlightedLine
				}

				// We're inside the block
				return type === "old"
					? `<span class="diff-removed">${line}</span>`
					: `<span class="diff-added">${line}</span>`
			}

			return line
		})
		.join("\n")
}

function createApiItem(api, data) {
	const wrapper = document.createElement("div")
	wrapper.className = "api-item"

	const header = document.createElement("div")
	header.className = "api-header"

	const title = document.createElement("span")
	title.textContent = api

	const badge = document.createElement("span")
	badge.className = `badge ${data.status}`
	badge.textContent = data.status

	header.appendChild(title)
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
	if (hasChanges) {
		changesHtml = `<div class="changes-section">
			<h4><img src="icons/search.png" alt="Search" class="icon"> Changes Detected</h4>`

		if (data.changes.added?.length > 0) {
			changesHtml += `<p><img src="icons/plus.png" alt="Added" class="icon-small"><strong>Added Fields:</strong> ${data.changes.added.join(", ")}</p>`
		}

		if (data.changes.removed?.length > 0) {
			changesHtml += `<p><img src="icons/minus.png" alt="Removed" class="icon-small"><strong>Removed Fields:</strong> ${data.changes.removed.join(", ")}</p>`
		}

		if (data.changes.typeChanged?.length > 0) {
			changesHtml += `<p><strong>🔄 Type Changed:</strong></p><ul>`
			data.changes.typeChanged.forEach((change) => {
				changesHtml += `<li><code>${change.field}</code>: <span class="old-type">${change.oldType}</span> → <span class="new-type">${change.newType}</span></li>`
			})
			changesHtml += `</ul>`
		}

		changesHtml += `</div>`
	}

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
          <button class="btn-approve" data-api="${api}">Update Schema </button>
        </div>
      `
				: `
        <div class="schema-display">
          <h4>Current Schema</h4>
          <pre>${JSON.stringify(data.schema, null, 2)}</pre>
        </div>
        ${hasChanges && data.status !== "new" ? changesHtml : ""}

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

function renderRegistry(registry) {
	const container = document.getElementById("output")

	if (!container) {
		console.error("Output container not found")
		return
	}

	container.innerHTML = ""

	const entries = Object.entries(registry)

	if (entries.length === 0) {
		container.innerHTML =
			"<p class='empty-state'>No APIs tracked yet. Navigate to a page with API calls to start monitoring.</p>"
		return
	}

	entries.forEach(([api, data]) => {
		container.appendChild(createApiItem(api, data))
	})
}

const devtoolsPort = chrome.runtime.connect({ name: "devtools" })

devtoolsPort.onMessage.addListener((msg) => {
	if (msg.type === "REGISTRY_UPDATED") {
		loadRegistry()
	}

	if (msg.type === "REGISTRY_DATA") {
		renderRegistry(msg.payload)
	}
})

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
document.addEventListener("DOMContentLoaded", loadRegistry)

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "local" && changes.apiRegistry) {
		console.log("Registry updated, refreshing...")
		loadRegistry()
	}
})
