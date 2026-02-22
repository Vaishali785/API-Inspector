# API Inspector Chrome Extension

Track and monitor API schema changes in real-time during development.

## Features

- 🔍 Automatically detects API calls and extracts JSON schemas
- 📊 Tracks schema changes (added fields, removed fields, type changes)
- ⚠️ Alerts on breaking changes vs minor changes
- ✅ Manual approval workflow for schema updates
- 🌙 Automatic dark mode support
- 💾 Persistent storage of API schemas

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the folder containing these extension files

## Files Structure

```
api-inspector/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker (schema comparison logic)
├── devtools.js           # DevTools network listener
├── devtools.html         # DevTools page loader
├── panel.js              # Panel UI logic
├── panel.html            # Panel HTML structure
├── panel.css             # Panel styles (with dark mode)
├── icon16.png            # Extension icon (16x16)
├── icon48.png            # Extension icon (48x48)
└── icon128.png           # Extension icon (128x128)
```

## Usage

1. Open Chrome DevTools (F12 or right-click → Inspect)
2. Navigate to the "API Inspector" tab
3. Browse your application that makes API calls
4. The extension will automatically track APIs matching:
   - URLs containing `/api/`
   - URLs containing `/projects`
   - Content-Type: `application/json`

## How It Works

### Schema Detection

When an API call is made, the extension:

1. Intercepts the response
2. Parses the JSON
3. Generates a schema showing field names and types
4. Compares with previously saved schema

### Change Detection

Three types of changes are tracked:

- **🟢 Minor**: New fields added (non-breaking)
- **🔴 Breaking**: Fields removed or types changed
- **✅ Up-to-date**: No changes detected

### Approval Workflow

When changes are detected:

1. Status changes to "breaking" or "minor"
2. Pending notice appears with change details
3. New schema is shown with highlighted changes
4. Click "✅ Update Schema" to accept the changes
5. Schema is saved to Chrome storage

## Customization

### Tracking Different APIs

Edit `devtools.js` line 29 to customize which APIs to track:

```javascript
const isBackend = url.includes("/api/") || url.includes("/your-endpoint")
```

### Change Status Colors

Edit `panel.css` badge styles to customize colors:

```css
.badge.breaking {
	background: #ffebee;
	color: #c62828;
}
```

## Storage

All schemas are stored in Chrome's local storage:

- Access via Chrome DevTools → Application → Storage → Extension
- Clear storage: `chrome.storage.local.clear()`

## Development

### Testing Changes

1. Make code changes
2. Go to `chrome://extensions/`
3. Click the refresh icon on the API Inspector extension
4. Reload your DevTools

### Debugging

- Background script logs: `chrome://extensions/` → "Inspect views: service worker"
- Panel logs: DevTools → API Inspector tab → Console
- DevTools logs: Regular DevTools console
