function highlightSchema(schema, changes, type) {
	const json = JSON.stringify(schema, null, 1)
	const lines = json.split("\n")

	let insideRemovedBlock = false
	let insideAddedBlock = false
	let braceDepth = 0

	return lines
		.map((line) => {
			const trimmed = line.trim()

			const fieldMatch = changes?.removed?.find((f) =>
				trimmed.includes(`"${f.split(".").pop()}"`),
			)

			const addedMatch = changes?.added?.find((f) =>
				trimmed.includes(`"${f.split(".").pop()}"`),
			)

			// START removed block
			if (type === "old" && fieldMatch) {
				insideRemovedBlock = true
				braceDepth = 0
			}

			// START added block
			if (type === "new" && addedMatch) {
				insideAddedBlock = true
				braceDepth = 0
			}

			// Track nested brackets
			if (insideRemovedBlock || insideAddedBlock) {
				if (line.includes("[") || line.includes("{")) braceDepth++
				if (line.includes("]") || line.includes("}")) braceDepth--
			}

			// END block
			if (insideRemovedBlock && braceDepth <= 0) {
				insideRemovedBlock = false
			}

			if (insideAddedBlock && braceDepth <= 0) {
				insideAddedBlock = false
			}

			if (insideRemovedBlock) {
				return `<span class="diff-removed">- ${line}</span>`
			}

			if (insideAddedBlock) {
				return `<span class="diff-added">+ ${line}</span>`
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
    <p><strong>Created:</strong> ${new Date(data.createdAt).toLocaleString()}</p>
    <p><strong>Last Updated:</strong> ${new Date(data.lastUpdated).toLocaleString()}</p>
    
    ${
			hasPendingChanges
				? `
        <div class="pending-notice">
          <img src="icons/warning.png" alt="Warning" class="icon">  <strong>Pending Changes - Awaiting Approval</strong>
        </div>
        
        ${changesHtml}
        
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
        
        <div class="action-buttons">
          <button class="btn-approve" data-api="${api}"><img src="icons/check.png" alt="Check" class="icon-small"> Update Schema </button>
        </div>
      `
				: `
        <div class="schema-display">
          <h4>Current Schema</h4>
          <pre>${JSON.stringify(data.schema, null, 2)}</pre>
        </div>
        ${hasChanges && data.status !== "new" ? changesHtml : ""}
        ${!hasChanges && data.status !== "new" ? "<p><em>✓ No changes detected</em></p>" : ""}
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
	chrome.runtime.sendMessage(
		{
			type: "APPROVE_CHANGES",
			payload: { api },
		},
		(response) => {
			if (response && response.success) {
				console.log("Changes approved for:", api)
				loadRegistry() // Refresh the UI
			} else {
				console.error("Failed to approve changes:", response?.error)
			}
		},
	)
}

function rejectChanges(api) {
	chrome.runtime.sendMessage(
		{
			type: "REJECT_CHANGES",
			payload: { api },
		},
		(response) => {
			if (response && response.success) {
				console.log("Changes rejected for:", api)
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

function loadRegistry() {
	chrome.runtime.sendMessage({ type: "GET_REGISTRY" }, (response) => {
		console.log("Panel received registry:", response)
		if (response) {
			renderRegistry(response)
		} else {
			console.error("No response from background")
		}
	})
}

// Load on page load
document.addEventListener("DOMContentLoaded", loadRegistry)

// Auto-refresh every 2 seconds to catch updates
// setInterval(loadRegistry, 2000)

// // Also add a manual refresh button functionality if you have one
// const refreshBtn = document.getElementById("refresh-btn")
// if (refreshBtn) {
// 	refreshBtn.addEventListener("click", loadRegistry)
// }
