# ⬡ TaskFlow — AI-Powered Task Manager

A beautiful, production-ready task manager that converts free-form text (typed or spoken) into a structured task table and syncs it to Google Sheets.

![TaskFlow Screenshot](https://via.placeholder.com/900x500/0d0d0f/c8f050?text=TaskFlow)

---

## ✨ Features

- **🎙 Speech-to-Text** — Speak your tasks using the Web Speech API (Chrome/Edge)
- **✎ Text Input** — Paste or type any free-form task description
- **🤖 AI Parsing** — Anthropic Claude extracts structured tasks (title, assignee, due date, priority, category)
- **📋 Regex Fallback** — Works without an API key using smart keyword detection
- **📊 Google Sheets Sync** — Push tasks directly to your spreadsheet
- **✏️ Inline Editing** — Click any cell to edit in-place
- **🔄 Status Toggle** — Cycle tasks through To Do → Doing → Done
- **↓ CSV Export** — Download tasks as a CSV file
- **💾 Local Persistence** — Tasks saved in localStorage across sessions

---

## 🚀 Quick Start

This is a **static HTML app** — no build step required.

```bash
git clone https://github.com/YOUR_USERNAME/taskflow.git
cd taskflow

# Option 1: Open directly
open index.html

# Option 2: Serve locally (recommended for Speech API)
npx serve .
# or
python3 -m http.server 3000
```

Then open `http://localhost:3000` in your browser.

---

## 🔑 API Keys Setup

Open the **⚙ Google Sheets Integration** panel at the bottom of the task board.

### Anthropic API Key (for AI parsing)
1. Get a key at [console.anthropic.com](https://console.anthropic.com)
2. Paste it into the **Anthropic API Key** field
3. Keys are stored in your browser's `localStorage` — never sent elsewhere

### Google Sheets API Key (for Sheets sync)

> ⚠️ **Note:** The Google Sheets API requires OAuth 2.0 for write access. A plain API key only works for public sheets in read mode. For full write support in production, integrate [Google Identity Services](https://developers.google.com/identity/gsi/web).

For testing:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable the **Google Sheets API**
3. Create an API key under **APIs & Services → Credentials**
4. Set the **Spreadsheet ID** to your sheet's ID (visible in the URL)

Your target sheet: `1MA6djb09zkWRaEwLrMDJJbbh48jAKR0jsThn-pgxqg0`

---

## 📁 Project Structure

```
taskflow/
├── index.html          # App shell + markup
├── src/
│   ├── style.css       # All styles (CSS variables, dark theme)
│   └── app.js          # All logic (parsing, rendering, sync)
└── README.md
```

---

## 🎯 How It Works

### AI Parsing (with Anthropic key)
```
"Call John tomorrow about the budget, high priority. Fix login bug ASAP, assign to Sara."
    ↓
[
  { title: "Call John about the budget", assignee: "John", dueDate: "2026-04-25", priority: "high", category: "Meeting" },
  { title: "Fix login bug", assignee: "Sara", dueDate: "", priority: "critical", category: "Engineering" }
]
```

### Regex Fallback (no key needed)
Uses keyword detection to infer:
- **Priority**: `urgent`, `ASAP`, `critical` → critical; `important` → high
- **Assignee**: `assign to X`, `for X`, `by X`
- **Due date**: `tomorrow`, `next Monday`, `end of week`, `Friday`
- **Category**: keywords like `bug`, `meeting`, `design`, `marketing`, etc.

---

## 🌐 Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Core app | ✅ | ✅ | ✅ | ✅ |
| Speech-to-text | ✅ | ❌ | ⚠️ partial | ✅ |
| Sheets sync | ✅ | ✅ | ✅ | ✅ |

Speech recognition requires HTTPS or localhost.

---

## 🛠 Customization

Edit `src/style.css` CSS variables at the top to retheme the app:

```css
:root {
  --accent: #c8f050;   /* Change the green accent */
  --bg: #0d0d0f;       /* Background */
}
```

---

## 📄 License

MIT — free to use, modify, and distribute.
