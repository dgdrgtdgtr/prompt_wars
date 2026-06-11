/**
 * EcoTrace — Carbon Footprint Awareness Platform
 * Handles: multi-step calculator, results visualisation,
 *          tips filtering, and AI assistant via Anthropic API.
 */

'use strict';

/* ─── Constants ─────────────────────────────────────────────── */

const EMISSION_FACTORS = {
  // Home energy (kg CO2 per kWh / unit)
  energy: { coal: 0.92, gas: 0.55, mixed: 0.45, renewable: 0.05, solar: 0.02 },
  heating: { gas: 0.2, electric: 0.1, none: 0, solar_thermal: 0.01 },

  // Transport (kg CO2 per km)
  car: { none: 0, petrol: 0.21, diesel: 0.17, hybrid: 0.11, ev: 0.07 },

  // Flights (tonnes CO2 each)
  flightShort: 0.25,
  flightLong:  1.6,

  // Diet (tonnes CO2 per year)
  diet: { vegan: 1.5, vegetarian: 1.7, pescatarian: 2.1, omnivore: 2.5, high_meat: 3.3 },
  food_waste:  { low: -0.1, medium: 0, high: 0.2 },

  // Shopping (per item)
  clothing: 0.01,     // tonnes CO2 per garment
  electronics: 0.15,  // tonnes CO2 per device

  // Digital (kg CO2 per streaming hour per year basis)
  streaming: 0.0006,
};

const TIPS = [
  { icon: '⚡', cat: 'home',     title: 'Switch to renewable energy',      desc: 'Move to a green tariff or install solar panels to instantly cut your home CO₂ by 1–2 tonnes/year.', impact: 'high' },
  { icon: '💡', cat: 'home',     title: 'LED lighting throughout',          desc: 'Replace all bulbs with LEDs — uses 90% less energy and lasts 25× longer.', impact: 'low' },
  { icon: '🌡️', cat: 'home',     title: 'Drop heating by 1°C',              desc: 'Reducing your thermostat by just 1°C saves around 310 kg CO₂ per year.', impact: 'medium' },
  { icon: '🪟', cat: 'home',     title: 'Insulate walls and roof',          desc: 'Up to 35% of heat is lost through walls. Insulation can save 1 tonne CO₂ annually.', impact: 'high' },
  { icon: '✈️', cat: 'travel',   title: 'Eliminate one long-haul flight',   desc: 'One return long-haul flight emits 1.5–3 tonnes CO₂ — more than many people\'s monthly footprint.', impact: 'high' },
  { icon: '🚄', cat: 'travel',   title: 'Train over plane for short trips', desc: 'Rail emits 6–10× less CO₂ than flying. For journeys under 500 km, always choose rail.', impact: 'high' },
  { icon: '🚲', cat: 'travel',   title: 'Cycle or walk for short trips',    desc: 'Replacing car trips under 5 km with cycling eliminates those emissions entirely.', impact: 'medium' },
  { icon: '🔋', cat: 'travel',   title: 'Switch to an electric vehicle',    desc: 'EVs produce 3× less lifetime CO₂ than petrol cars, even accounting for manufacturing.', impact: 'high' },
  { icon: '🌱', cat: 'food',     title: 'Try plant-based meals 3×/week',   desc: 'Reducing meat intake by 3 days/week can cut food emissions by 30% without going fully vegetarian.', impact: 'high' },
  { icon: '🥩', cat: 'food',     title: 'Cut beef consumption in half',     desc: 'Beef produces 20× more CO₂ than legumes per gram of protein. Halving it saves ~0.5 t/yr.', impact: 'high' },
  { icon: '🛒', cat: 'food',     title: 'Buy local and seasonal produce',   desc: 'Transport accounts for ~11% of food emissions. Local and seasonal cuts this drastically.', impact: 'medium' },
  { icon: '🗑️', cat: 'food',     title: 'Halve your food waste',            desc: 'One-third of all food is wasted. Cutting waste saves money and ~0.3 tonnes CO₂ per year.', impact: 'medium' },
  { icon: '👗', cat: 'shopping', title: 'Buy secondhand clothing',          desc: 'The fashion industry emits 10% of global CO₂. Secondhand clothing eliminates manufacturing emissions.', impact: 'medium' },
  { icon: '📱', cat: 'shopping', title: 'Keep electronics for longer',      desc: 'Manufacturing a smartphone takes ~70 kg CO₂. Keeping it one extra year halves its annual impact.', impact: 'medium' },
  { icon: '♻️', cat: 'shopping', title: 'Recycle and repair first',         desc: 'Buying repaired goods avoids new manufacturing emissions entirely. Repair, then recycle.', impact: 'low' },
  { icon: '📦', cat: 'shopping', title: 'Reduce online delivery frequency', desc: 'Batch deliveries together. Multiple deliveries emit far more than a single consolidated order.', impact: 'low' },
];

/* ─── State ──────────────────────────────────────────────────── */

let currentStep = 1;
let calculatorResult = null;
let chatHistory = [];
let isWaiting = false;

/* ─── Animated counter (hero stats) ─────────────────────────── */

function animateCounter(el, target, decimals = 0) {
  const duration = 1800;
  const start    = performance.now();

  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 4);
    const current  = (eased * target).toFixed(decimals);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function initCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target;
        const target = parseFloat(el.dataset.target);
        const decimals = target % 1 !== 0 ? 1 : 0;
        animateCounter(el, target, decimals);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.stat__number').forEach(el => observer.observe(el));
}

/* ─── Multi-step calculator ──────────────────────────────────── */

function nextStep(n) {
  document.getElementById(`step${currentStep}`).classList.remove('active');
  document.getElementById(`step${n}`).classList.add('active');
  currentStep = n;
  updateProgress(n);
}

function prevStep(n) {
  document.getElementById(`step${currentStep}`).classList.remove('active');
  document.getElementById(`step${n}`).classList.add('active');
  currentStep = n;
  updateProgress(n);
}

function updateProgress(step) {
  const fill  = document.getElementById('progressFill');
  const steps = document.querySelectorAll('.calc-progress__steps .step');

  fill.style.width = `${(step / 4) * 100}%`;
  document.querySelector('.calc-progress').setAttribute('aria-valuenow', step);

  steps.forEach((s, i) => {
    s.classList.toggle('step--active', i + 1 === step);
  });
}

/* ─── Emission calculations ──────────────────────────────────── */

function calculateFootprint() {
  const get = id => sanitiseInput(document.getElementById(id)?.value ?? '');
  // Safe numeric: clamp to [min, max], treat NaN/negative as min
  const getNum = (id, min = 0, max = Infinity) => {
    const n = parseFloat(get(id));
    if (isNaN(n) || n < min) return min;
    return Math.min(n, max);
  };
  const getRadio = name => {
    const el = document.querySelector(`[name="${name}"]:checked`);
    return el ? el.value : null;
  };

  // HOME
  const energySrc   = get('energy_source') || 'mixed';
  const monthlyBill = getNum('monthly_bill', 0, 100000);
  const heatingType = get('heating') || 'none';

  // Estimate kWh from bill (India avg ₹8/kWh approx)
  const estimatedKwh = monthlyBill / 8;
  const homeEnergy   = estimatedKwh * 12 * (EMISSION_FACTORS.energy[energySrc] || 0.45) / 1000; // tonnes
  const homeHeating  = EMISSION_FACTORS.heating[heatingType] || 0; // tonnes/yr estimate

  const home = +(homeEnergy + homeHeating).toFixed(2);

  // TRAVEL
  const carType  = get('car_type') || 'none';
  const kmWeek   = getNum('km_per_week', 0, 10000);
  const fShort   = getNum('flights_short', 0, 365);
  const fLong    = getNum('flights_long', 0, 365);

  const carEmissions  = kmWeek * 52 * (EMISSION_FACTORS.car[carType] || 0) / 1000; // tonnes
  const flightEmit    = (fShort * EMISSION_FACTORS.flightShort) + (fLong * EMISSION_FACTORS.flightLong);

  const travel = +(carEmissions + flightEmit).toFixed(2);

  // FOOD
  const dietType  = getRadio('diet_type') || 'omnivore';
  const localPct  = getNum('local_food', 0, 100) / 100;
  const foodWaste = get('food_waste') || 'medium';

  const dietBase     = EMISSION_FACTORS.diet[dietType] || 2.5;
  const localBonus   = -(localPct * 0.3); // up to 0.3t saving for 100% local
  const wasteAdj     = EMISSION_FACTORS.food_waste[foodWaste] || 0;

  const food = +Math.max(0, dietBase + localBonus + wasteAdj).toFixed(2);

  // SHOPPING
  const clothes    = getNum('new_clothes', 0, 10000);
  const electronics= getNum('electronics', 0, 1000);
  const streaming  = getNum('streaming', 0, 24);
  const recycling  = get('recycling') || 'most';

  const recyclingBonus = { none: 0, some: -0.05, most: -0.15, all: -0.25 };
  const shoppingRaw = (clothes * EMISSION_FACTORS.clothing) +
                      (electronics * EMISSION_FACTORS.electronics) +
                      (streaming * 365 * EMISSION_FACTORS.streaming / 1000) +
                      (recyclingBonus[recycling] || 0);

  const shopping = +Math.max(0, shoppingRaw).toFixed(2);

  // TOTAL
  const total = +(home + travel + food + shopping).toFixed(2);

  calculatorResult = { total, home, travel, food, shopping };
  displayResults(calculatorResult);
}

/* ─── Results display ────────────────────────────────────────── */

function displayResults(data) {
  const form    = document.getElementById('calcForm');
  const results = document.getElementById('results');

  form.style.display    = 'none';
  results.hidden        = false;

  // Date stamp
  document.getElementById('results__date').textContent =
    `Calculated on ${new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}`;

  // Score ring animation (0–10t scale, capped at 10)
  const pct       = Math.min(data.total / 10, 1);
  const circumference = 502;
  const offset    = circumference - (pct * circumference);
  const ringFill  = document.getElementById('ringFill');

  setTimeout(() => {
    ringFill.style.strokeDashoffset = offset;
    // Colour coding
    if (data.total <= 2)       ringFill.style.stroke = '#8FFF6A';
    else if (data.total <= 4.7) ringFill.style.stroke = '#FFD166';
    else                        ringFill.style.stroke = '#FF6B6B';
  }, 100);

  // Animate number
  const scoreEl = document.getElementById('totalScore');
  animateCounter(scoreEl, data.total, 1);

  // Label
  const label = document.getElementById('scoreLabel');
  if (data.total <= 2)        { label.textContent = '🌱 On target'; label.style.color = '#8FFF6A'; }
  else if (data.total <= 4.7) { label.textContent = '⚠️ Above target'; label.style.color = '#FFD166'; }
  else                         { label.textContent = '🔴 High impact'; label.style.color = '#FF6B6B'; }

  // Breakdown bars
  const container = document.getElementById('breakdownBars');
  container.innerHTML = '';

  const categories = [
    { label: 'Home',     val: data.home,     color: '#64B6FF' },
    { label: 'Travel',   val: data.travel,   color: '#FFD166' },
    { label: 'Food',     val: data.food,     color: '#8FFF6A' },
    { label: 'Shopping', val: data.shopping, color: '#FF9F6B' },
  ];

  const max = Math.max(...categories.map(c => c.val), 0.1);

  categories.forEach(cat => {
    const pctW = Math.round((cat.val / max) * 100);
    const bar  = document.createElement('div');
    bar.className = 'breakdown-bar';
    bar.setAttribute('role', 'listitem');
    bar.setAttribute('aria-label', `${cat.label}: ${cat.val} tonnes CO2`);
    bar.innerHTML = `
      <span class="breakdown-bar__label">${cat.label}</span>
      <div class="breakdown-bar__track">
        <div class="breakdown-bar__fill" style="width:0%;background:${cat.color}" data-target="${pctW}"></div>
      </div>
      <span class="breakdown-bar__val">${cat.val}t</span>
    `;
    container.appendChild(bar);
  });

  // Animate bars
  setTimeout(() => {
    container.querySelectorAll('.breakdown-bar__fill').forEach(el => {
      el.style.width = el.dataset.target + '%';
    });
  }, 200);

  // Comparison diffs
  const globalDiff = document.getElementById('globalDiff');
  const parisDiff  = document.getElementById('parisDiff');

  const vsGlobal = (data.total - 4.7).toFixed(1);
  const vsParis  = (data.total - 2.0).toFixed(1);

  globalDiff.textContent = vsGlobal > 0 ? `+${vsGlobal}t` : `${vsGlobal}t`;
  globalDiff.className   = `compare-card__diff ${vsGlobal > 0 ? 'diff--bad' : 'diff--good'}`;

  parisDiff.textContent  = vsParis > 0 ? `+${vsParis}t` : `${vsParis}t`;
  parisDiff.className    = `compare-card__diff ${vsParis > 0 ? 'diff--bad' : vsParis > -1 ? 'diff--ok' : 'diff--good'}`;

  // Scroll to results
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetCalc() {
  const form    = document.getElementById('calcForm');
  const results = document.getElementById('results');

  form.style.display = '';
  results.hidden     = true;
  currentStep        = 1;

  document.querySelectorAll('.calc-step').forEach(s => s.classList.remove('active'));
  document.getElementById('step1').classList.add('active');
  updateProgress(1);

  document.getElementById('calcForm').reset();
  document.getElementById('localFoodVal').textContent = '30%';
}

/* ─── Tips rendering & filtering ────────────────────────────── */

function renderTips(category = 'all') {
  const grid    = document.getElementById('tipsGrid');
  const filtered = category === 'all' ? TIPS : TIPS.filter(t => t.cat === category);

  grid.innerHTML = filtered.map(tip => `
    <div class="tip-card" role="listitem">
      <div class="tip-card__icon" aria-hidden="true">${tip.icon}</div>
      <div class="tip-card__body">
        <h4>${tip.title}</h4>
        <p>${tip.desc}</p>
        <span class="tip-card__impact impact--${tip.impact}">
          ${tip.impact.toUpperCase()} IMPACT
        </span>
      </div>
    </div>
  `).join('');
}

function filterTips(cat, btn) {
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-pressed', 'false');
  });
  btn.classList.add('active');
  btn.setAttribute('aria-pressed', 'true');
  renderTips(cat);
}

/* ─── AI Chat ────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `You are EcoTrace, a knowledgeable and friendly carbon footprint assistant. 
Your job is to help users understand their environmental impact and give concrete, actionable advice to reduce their carbon footprint.

Guidelines:
- Be conversational, clear, and encouraging — not preachy or alarmist
- Use specific numbers and statistics when possible (cite sources like IPCC, OurWorldInData, etc. by name)
- Tailor advice to practical actions people can realistically take
- When discussing food, acknowledge cultural context — many users are from India
- Keep responses concise (3–5 sentences) unless a longer explanation is genuinely needed
- Use emojis sparingly — one per response maximum
- Never be condescending about lifestyle choices; offer alternatives, not lectures
- If a user has calculator results available, reference them specifically

Topics you excel at: carbon footprints by category, climate science basics, renewable energy, sustainable transport, food emissions, circular economy, scope 1/2/3 emissions, Paris Agreement, and personal vs systemic change.`;

function appendMessage(role, content) {
  const messages = document.getElementById('chatMessages');

  // Remove suggestion buttons if present (after first user message)
  if (role === 'user') {
    const suggestions = messages.querySelector('.chat__suggestions');
    if (suggestions) suggestions.remove();
  }

  const isAssistant = role === 'assistant';
  const div = document.createElement('div');
  div.className = `chat__message chat__message--${isAssistant ? 'assistant' : 'user'}`;
  div.innerHTML = `
    <div class="chat__avatar" aria-hidden="true">${isAssistant ? '◈' : '👤'}</div>
    <div class="chat__bubble">${formatMessage(content)}</div>
  `;

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

/**
 * Sanitise arbitrary string input — strips HTML/script tags.
 * @param {*} value
 * @returns {*} sanitised value (non-strings returned as-is)
 */
function sanitiseInput(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Validate that a URL is safe (only http/https protocols).
 * Prevents javascript: and data: URL injection.
 * @param {string} url
 * @returns {boolean}
 */
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return ['https:', 'http:'].includes(u.protocol);
  } catch {
    return false;
  }
}

/**
 * Format AI message safely — escapes HTML first, then applies
 * markdown-style bold and line-break conversion.
 * Prevents XSS from any AI-generated or user-supplied content.
 * @param {string} text
 * @returns {string} safe HTML string
 */
function formatMessage(text) {
  if (typeof text !== 'string') return '';
  // 1. Escape all HTML entities first
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  // 2. Apply safe markdown transforms on escaped text
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function showTyping() {
  const messages = document.getElementById('chatMessages');
  const div      = document.createElement('div');
  div.className  = 'chat__message chat__message--assistant';
  div.id         = 'typingIndicator';
  div.innerHTML  = `
    <div class="chat__avatar" aria-hidden="true">◈</div>
    <div class="chat__bubble">
      <div class="typing-indicator" aria-label="Assistant is typing">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function removeTyping() {
  document.getElementById('typingIndicator')?.remove();
}

async function sendMessage() {
  if (isWaiting) return;

  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';

  appendMessage('user', text);
  chatHistory.push({ role: 'user', content: text });

  isWaiting = true;
  document.getElementById('chatSendBtn').disabled = true;
  showTyping();

  // Build context from calculator results if available
  let contextNote = '';
  if (calculatorResult) {
    contextNote = `\n\nUser's calculated footprint: Total ${calculatorResult.total}t CO₂/yr (Home: ${calculatorResult.home}t, Travel: ${calculatorResult.travel}t, Food: ${calculatorResult.food}t, Shopping: ${calculatorResult.shopping}t).`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: SYSTEM_PROMPT + contextNote,
        messages: chatHistory,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data    = await response.json();
    const reply   = data.content?.find(b => b.type === 'text')?.text ?? 'Sorry, I couldn\'t generate a response.';

    removeTyping();
    appendMessage('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });

  } catch (err) {
    removeTyping();
    appendMessage('assistant', `I'm having trouble connecting right now. Please try again in a moment. (${err.message})`);
    console.error('Chat API error:', err);
  } finally {
    isWaiting = false;
    document.getElementById('chatSendBtn').disabled = false;
    input.focus();
  }
}

function sendSuggestion(btn) {
  const text = btn.textContent;
  document.getElementById('chatInput').value = text;
  sendMessage();
}

function handleChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }

  // Auto-resize textarea
  const ta = e.target;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
}

/* ─── Init ───────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  initCounters();
  renderTips();

  // Auto-resize chat input on input event
  const chatInput = document.getElementById('chatInput');
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  });
});
