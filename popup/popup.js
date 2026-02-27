const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
document.documentElement.dataset.theme = isDark ? "dark" : "light"

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
	if (tabs[0]) {
		const origin = new URL(tabs[0].url).origin
		const settingsKey = `apiSettings_${origin}`

		document.getElementById("save").addEventListener("click", () => {
			const patterns = document
				.getElementById("api-patterns")
				.value.split(",")
				.map((p) => p.trim())
				.filter((p) => p.length > 0)

			const trackAll = document.getElementById("track-all").checked
			chrome.storage.local.set(
				{
					[settingsKey]: {
						apiPatterns: patterns.length > 0 ? patterns : [],
						trackAllJSON: trackAll,
					},
				},
				() => {
					document.getElementById("status").textContent =
						"✓ Settings saved for this domain!"

					setTimeout(() => {
						document.getElementById("status").textContent = ""
					}, 2000)
				},
			)
		})

		// Load saved settings
		chrome.storage.local.get([settingsKey], (result) => {
			const settings = result[settingsKey]
			if (settings) {
				document.getElementById("api-patterns").value =
					settings.apiPatterns.join(", ")
				document.getElementById("track-all").checked = settings.trackAllJSON
			}
		})

		document.getElementById("delete").addEventListener("click", () => {
			chrome.runtime.sendMessage(
				{
					type: "CLEAR_SITE_APIS",
					payload: { origin },
				},
				(response) => {
					const statusEl = document.getElementById("status")

					if (chrome.runtime.lastError) {
						console.error("Error:", chrome.runtime.lastError.message)
						statusEl.textContent = "⚠️ Failed to clear APIs."
						return
					}

					if (response && response.success) {
						statusEl.textContent = "✓ APIs cleared for this site!"

						setTimeout(() => {
							statusEl.textContent = ""
						}, 2000)
					} else {
						statusEl.textContent = "⚠️ Something went wrong."
					}
				},
			)
		})
	}
})
