# 🌍 EcoTrace — Carbon Footprint Awareness Platform

> **Challenge 3: Carbon Footprint Awareness Platform**  
> A smart, dynamic assistant that helps users understand and reduce their environmental impact.

---

## 📌 Chosen Vertical

**Environmental Awareness & Personal Climate Action**

EcoTrace empowers individuals to understand their carbon footprint across four key life domains — home energy, travel, food, and shopping — and provides AI-powered guidance to help them reduce it.

---

## 🧠 Approach & Logic

### Problem
Most people have no intuitive understanding of their carbon footprint. Abstract statistics ("4.7 tonnes CO₂ per year globally") don't connect to daily decisions.

### Solution
EcoTrace bridges that gap through three core pillars:

1. **Guided Calculator** — A 4-step, context-aware form that maps real user behaviour (energy bills, driving habits, diet, shopping) to CO₂ emissions using established emission factors (IPCC, DEFRA, Our World in Data).

2. **Visual Feedback** — Animated score ring with colour-coded thresholds, breakdown bars by category, and comparison against the global average and Paris Agreement target.

3. **AI Assistant** — Powered by Claude (claude-sonnet-4-20250514), the assistant provides contextual, personalised advice. It receives the user's calculator results as context, enabling responses like *"Your travel footprint is 3.8t — flights are your single biggest lever. Here's how to address that..."*

---

## ⚙️ How It Works

```
User Flow:
Home Energy → Travel → Food → Shopping → Results → AI Assistant
                                            ↑
                            Injected as context into AI system prompt
```

### Emission Calculation Methodology

| Category | Primary Inputs | Factors Used |
|----------|---------------|--------------|
| Home     | Monthly electricity bill, energy source, heating | IPCC grid emission factors (kg CO₂/kWh) |
| Travel   | Weekly km driven, vehicle type, flights          | DEFRA transport emission factors |
| Food     | Diet type, % local food, waste level             | Our World in Data food emission research |
| Shopping | Clothing items, electronics, streaming hours      | Lifecycle assessment data |

### AI Integration

The assistant uses Anthropic's Messages API with:
- A comprehensive system prompt defining the persona, tone, and knowledge scope
- Full conversation history maintained client-side for coherent multi-turn dialogue
- Dynamic context injection when calculator results are available
- Graceful error handling with user-friendly messages

---

## 🏗️ Architecture

```
carbon-footprint-platform/
├── index.html          # Single-page app, semantic HTML5
├── src/
│   ├── styles.css      # Design system with CSS custom properties
│   └── app.js          # Calculator logic, results visualisation, AI chat
└── README.md
```

**No build tools, no dependencies, no frameworks.** Vanilla HTML/CSS/JS for maximum performance, zero supply chain risk, and a repository well under 10 MB.

---

## 🎨 Design Decisions

- **Deep forest green + bio-glow chartreuse** — The palette evokes living ecosystems without the clichéd light-green. The signature glow accent communicates both energy and life.
- **Space Grotesk + Space Mono** — Space Grotesk's geometric warmth pairs with Space Mono's precision for data values, reinforcing the platform's dual character: approachable and rigorous.
- **Animated orbit earth** — The hero visual isn't decorative; it communicates the concept of monitoring a dynamic system.
- **Score ring** — Users see their footprint as a portion of a 10-tonne ceiling, with colour (green/amber/red) giving instant emotional feedback.

---

## ♿ Accessibility

- Semantic HTML5 landmarks (`nav`, `main`, `section`, `footer`, `fieldset`)
- All interactive elements have visible focus styles
- `aria-live` regions for dynamic content (results, chat)
- `aria-label` on non-obvious controls
- `role="progressbar"` with proper `aria-valuenow/min/max`
- `prefers-reduced-motion` respected — all animations disabled
- Colour contrast ratios meet WCAG 2.1 AA

---

## 🔒 Security

- No user data stored or transmitted except to the Anthropic API
- No third-party analytics or tracking
- API key handled server-side (via Anthropic's authentication proxy)
- Input sanitised before DOM insertion (no `innerHTML` with user data; AI responses use text-only fields)
- `novalidate` on form with manual validation approach

---

## 📐 Assumptions

1. **Indian context**: Energy bill estimate uses ₹8/kWh (India average residential tariff). Users outside India may get slightly different estimates, but the calculator UI makes this transparent.
2. **Scope 1 & 2 only**: The calculator focuses on direct and energy-related emissions (Scope 1 & 2). Embedded emissions in goods are approximated via lifecycle averages.
3. **Conservative baseline**: When input fields are left blank, calculations default to zero contribution from that category (not a national average), to avoid overstating impact.
4. **AI knowledge**: The AI assistant is grounded in climate science as of its training data. For regulatory or financial decisions, users are advised to consult qualified experts (visible disclaimer in the UI).

---

## 🚀 Running Locally

```bash
# No build step required — open directly in a browser
open index.html

# Or serve with any static server:
npx serve .
python -m http.server 8080
```

---

## 🧪 Testing

Manual testing checklist:
- [x] All 4 calculator steps navigate correctly
- [x] Progress bar updates accurately
- [x] Results display with animated ring and bars
- [x] Paris Agreement and global average comparisons show correct sign
- [x] Reset returns to step 1 with cleared form
- [x] Tips filter buttons work for all 4 categories
- [x] AI assistant sends messages, shows typing indicator, handles errors
- [x] Keyboard navigation (Tab, Enter, Shift+Enter in textarea)
- [x] Responsive layout on mobile (< 600px)
- [x] Reduced motion mode disables all animations

---

## 📊 Evaluation Criteria Mapping

| Criterion     | Implementation |
|---------------|----------------|
| Code Quality  | Modular JS with clear constants, functions, and comments. No global state pollution. |
| Security      | No stored PII, API keys proxied, user input not injected into DOM. |
| Efficiency    | Zero dependencies, single HTTP request for fonts, API calls only on demand. |
| Testing       | Manual test checklist above; input validation; error handling in all async paths. |
| Accessibility | WCAG 2.1 AA compliance, semantic HTML, keyboard navigation, reduced motion. |

---

## 🙏 Data Sources

- **IPCC** — Lifecycle emission factors for energy and transport
- **Our World in Data** — Food system emissions by diet type
- **DEFRA (UK)** — Vehicle emission factors
- **IEA** — Grid electricity emission intensities
- **Project Drawdown** — High-impact reduction strategies

---

*Built with ♥ for the Carbon Footprint Awareness Platform challenge.*
