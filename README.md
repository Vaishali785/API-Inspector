# API Inspector ⚡

A Chrome DevTools extension that detects and tracks API schema changes in real-time.

API Inspector helps frontend developers catch breaking API changes early by comparing live API responses against previously saved schemas — directly inside Chrome DevTools.

---

## 🚀 Why API Inspector?

APIs evolve constantly during development:

- New fields get added
- Fields get removed silently
- Data types change unexpectedly
- Backend updates break UI without warning

Manually tracking these changes is difficult and error-prone.

API Inspector provides:

✔ Automatic schema generation  
✔ Real-time schema diff detection  
✔ Breaking vs minor change classification  
✔ Manual approval workflow  
✔ Per-domain API tracking

All processed locally in the browser.

---

## ✨ Features

- 🔍 DevTools panel integration
- 📦 Automatic JSON schema extraction
- 🔁 Schema comparison engine
- ⚠️ Breaking change detection
- 🗂 Per-origin storage isolation
- 🎯 Custom URL-based API filtering
- 🧹 Clear APIs per site
- 🌙 Dark & Light theme support (matches DevTools)

---

## 🧠 How It Works

1. The extension listens to network requests inside DevTools.
2. Only JSON responses with HTTP `200` status are processed.
3. The response body is converted into a structural schema.
4. The schema is flattened and compared against the stored version.
5. Differences are categorized as:
   - `breaking`
   - `minor`
   - `unchanged`
6. If changes are detected, they must be manually approved.

All processing happens locally.  
No API data is sent externally.

---

## 🔄 Approval Workflow

When a schema change is detected:

1. API status updates to **`breaking`** or **`minor`**
2. A pending update indicator appears in the DevTools panel
3. The new schema is displayed side-by-side with the current schema
4. Differences are highlighted (added, removed, type changes)
5. Click **"Update Schema"** to approve the changes
6. The approved schema replaces the previous version in Chrome storage

This prevents silent contract drift and ensures intentional schema updates.

---

## ⚙️ Customization

Configuration is available per domain via the popup.

### 🔎 API Filters

- Add URL patterns (e.g. `/xhr`, `/settings`)
- Only matching requests are tracked
- Multiple patterns supported

### 📦 Track All JSON

- Optionally track all JSON responses
- Useful during exploration
- Can later be restricted using filters

### 🧹 Clear Site APIs

- Reset all stored schemas for the current domain
- Useful if filters were added late
- Does not affect other domains

---

## 📌 Behavior Notes

- Only HTTP `200` responses are processed.
- Cached responses (`304`) are ignored.
- Third-party APIs are only captured if the request referrer starts with the inspected page's origin.
- Changing filters does not remove previously captured APIs.
- DevTools may need to be reopened after theme changes.

---

## 🔐 Privacy & Security

API Inspector:

- Does NOT collect user data
- Does NOT transmit API responses
- Does NOT modify network requests
- Stores schema data locally using `chrome.storage`

All analysis is performed locally inside the browser.

---

## 🧩 Architecture Overview

- Manifest V3
- Background service worker
- DevTools panel integration
- Content script (origin detection)
- Per-origin schema registry
- Schema flattening + diff engine
- Manual approval workflow
- Safe dynamic rendering

---

## 📁 Project Structure

api-inspector/
│
├── manifest.json
├── background.js
├── popup/
│ ├── popup.html
│ ├── popup.js
│ └── popup.css
│
├── devtools/
│ ├── devtools.html
│ ├── devtools.js
│ ├── panel.html
│ ├── panel.js
│ └── panel.css
│
└── icons/

---

## 🛠 Installation (Development)

1. Clone the repository
2. Open `chrome://extensions`
3. Enable **Developer Mode**
4. Click **Load Unpacked**
5. Select the project folder

---

## 🎯 Future Improvements

- Schema version history
- Snapshot timeline
- Regex-based filtering
- Field ignore rules
- Schema export
- CI contract validation integration

---

## 👩‍💻 Author

**Vaishali**
Frontend Developer  
Building tools that improve developer workflows.

<!-- ### Testing Changes

1. Make code changes
2. Go to `chrome://extensions/`
3. Click the refresh icon on the API Inspector extension
4. Reload your DevTools

### Debugging

- Background script logs: `chrome://extensions/` → "Inspect views: service worker"
- Panel logs: DevTools → API Inspector tab → Console
- DevTools logs: Regular DevTools console -->
