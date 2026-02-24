const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches
document.documentElement.dataset.theme = isDark ? "dark" : "light"

// Load saved settings
chrome.storage.local.get(["apiPatterns", "trackAllJSON"], (result) => {
	if (result.apiPatterns) {
		document.getElementById("api-patterns").value =
			result.apiPatterns.join(", ")
	}
	if (result.trackAllJSON) {
		document.getElementById("track-all").checked = result.trackAllJSON
	}
})

// Save settings
document.getElementById("save").addEventListener("click", () => {
	const patterns = document
		.getElementById("api-patterns")
		.value.split(",")
		.map((p) => p.trim())
	// .filter((p) => p.length > 0)

	const trackAll = document.getElementById("track-all").checked

	chrome.storage.local.set(
		{
			apiPatterns: patterns || ["/api/"],
			trackAllJSON: trackAll,
		},
		() => {
			document.getElementById("status").textContent = "✓ Settings saved!"
			setTimeout(() => {
				document.getElementById("status").textContent = ""
			}, 2000)
		},
	)
})
