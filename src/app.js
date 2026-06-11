/**
 * EcoTrace — Carbon Footprint Awareness Platform
 * @module EcoTrace
 * @version 2.0.0
 *
 * Architecture:
 *  - EmissionEngine   : pure calculation logic, fully testable
 *  - DOMCache         : cached element references for efficiency
 *  - Calculator       : multi-step form controller
 *  - ResultsRenderer  : animated results display
 *  - TipsController   : filtering and rendering reduction tips
 *  - ChatController   : AI assistant with rate limiting & history
 *  - ProgressTracker  : localStorage-based footprint history
 *  - Utils            : sanitisation, validation, formatting
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════════ */

/** @type {Readonly<Object>} Emission factors sourced from IPCC / DEFRA / OurWorldInData */
const EMISSION_FACTORS = Object.freeze({
  energy:      { coal: 0.92, gas: 0.55, mixed: 0.45, renewable: 0.05, solar: 0.02 },
  heating:     { gas: 0.2, electric: 0.1, none: 0, solar_thermal: 0.01 },
  car:         { none: 0, petrol: 0.21, diesel: 0.17, hybrid: 0.11, ev: 0.07 },
  flightShort: 0.25,   // tonnes CO₂ per return short-haul flight
  flightLong:  1.6,    // tonnes CO₂ per return long-haul flight
  diet:        { vegan: 1.5, vegetarian: 1.7, pescatarian: 2.1, omnivore: 2.5, high_meat: 3.3 },
  foodWaste:   { low: -0.1, medium: 0, high: 0.2 },
  clothing:    0.01,   // tonnes CO₂ per garment (lifecycle avg)
  electronics: 0.15,  // tonnes CO₂ per device (lifecycle avg)
  streaming:   0.0006, // tonnes CO₂ per hour/year basis
  recyclingBonus: { none: 0, some: -0.05, most: -0.15, all: -0.25 },
});

const BENCHMARKS = Object.freeze({ globalAvg: 4.7, parisTarget: 2.0 });

const INPUT_LIMITS = Object.freeze({
  monthly_bill:   { min: 0, max: 100_000 },
  km_per_week:    { min: 0, max: 10_000 },
  flights_short:  { min: 0, max: 365 },
  flights_long:   { min: 0, max: 365 },
  local_food:     { min: 0, max: 100 },
  new_clothes:    { min: 0, max: 10_000 },
  electronics:    { min: 0, max: 1_000 },
  streaming:      { min: 0, max: 24 },
});

/** @type {ReadonlyArray<Object>} Reduction tips catalogue */
const TIPS = Object.freeze([
  { icon: '⚡', cat: 'home',     title: 'Switch to renewable energy',       desc: 'Move to a green tariff or install solar panels to instantly cut your home CO₂ by 1–2 tonnes/year.',          impact: 'high',   saving: 1.5  },
  { icon: '💡', cat: 'home',     title: 'LED lighting throughout',           desc: 'Replace all bulbs with LEDs — uses 90% less energy and lasts 25× longer.',                                    impact: 'low',    saving: 0.05 },
  { icon: '🌡️', cat: 'home',     title: 'Drop heating by 1°C',               desc: 'Reducing your thermostat by just 1°C saves around 310 kg CO₂ per year.',                                      impact: 'medium', saving: 0.31 },
  { icon: '🪟', cat: 'home',     title: 'Insulate walls and roof',           desc: 'Up to 35% of heat is lost through walls. Insulation can save 1 tonne CO₂ annually.',                          impact: 'high',   saving: 1.0  },
  { icon: '✈️', cat: 'travel',   title: 'Eliminate one long-haul flight',    desc: 'One return long-haul flight emits 1.5–3 tonnes CO₂ — more than many people\'s monthly footprint.',           impact: 'high',   saving: 1.6  },
  { icon: '🚄', cat: 'travel',   title: 'Train over plane for short trips',  desc: 'Rail emits 6–10× less CO₂ than flying. For journeys under 500 km, always choose rail.',                      impact: 'high',   saving: 0.5  },
  { icon: '🚲', cat: 'travel',   title: 'Cycle or walk for short trips',     desc: 'Replacing car trips under 5 km with cycling eliminates those emissions entirely.',                             impact: 'medium', saving: 0.3  },
  { icon: '🔋', cat: 'travel',   title: 'Switch to an electric vehicle',     desc: 'EVs produce 3× less lifetime CO₂ than petrol cars, even accounting for manufacturing.',                       impact: 'high',   saving: 1.2  },
  { icon: '🌱', cat: 'food',     title: 'Try plant-based meals 3×/week',    desc: 'Reducing meat intake by 3 days/week can cut food emissions by 30% without going fully vegetarian.',            impact: 'high',   saving: 0.7  },
  { icon: '🥩', cat: 'food',     title: 'Cut beef consumption in half',      desc: 'Beef produces 20× more CO₂ than legumes per gram of protein. Halving it saves ~0.5 t/yr.',                   impact: 'high',   saving: 0.5  },
  { icon: '🛒', cat: 'food',     title: 'Buy local and seasonal produce',    desc: 'Transport accounts for ~11% of food emissions. Local and seasonal cuts this drastically.',                     impact: 'medium', saving: 0.2  },
  { icon: '🗑️', cat: 'food',     title: 'Halve your food waste',             desc: 'One-third of all food is wasted. Cutting waste saves money and ~0.3 tonnes CO₂ per year.',                   impact: 'medium', saving: 0.3  },
  { icon: '👗', cat: 'shopping', title: 'Buy secondhand clothing',           desc: 'The fashion industry emits 10% of global CO₂. Secondhand clothing eliminates manufacturing emissions.',        impact: 'medium', saving: 0.2  },
  { icon: '📱', cat: 'shopping', title: 'Keep electronics for longer',       desc: 'Manufacturing a smartphone takes ~70 kg CO₂. Keeping it one extra year halves its annual impact.',            impact: 'medium', saving: 0.15 },
  { icon: '♻️', cat: 'shopping', title: 'Recycle and repair first',          desc: 'Buying repaired goods avoids new manufacturing emissions entirely. Repair, then recycle.',                     impact: 'low',    saving: 0.1  },
  { icon: '📦', cat: 'shopping', title: 'Reduce online delivery frequency',  desc: 'Batch deliveries together. Multiple deliveries emit far more than a single consolidated order.',              impact: 'low',    saving: 0.05 },
]);

const VALID_CATEGORIES = Object.freeze(['home', 'travel', 'food', 'shopping']);

/* ═══════════════════════════════════════════════════════════════
   UTILS — pure helpers, fully testable
═══════════════════════════════════════════════════════════════ */

const Utils = Object.freeze({
  /**
   * Clamp a numeric value to [min, max]. Returns min for NaN/below-range.
   * @param {*} value - raw input value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  clampNum(value, min = 0, max = Infinity) {
    const n = parseFloat(value);
    if (isNaN(n) || n < min) return min;
    return Math.min(n, max);
  },

  /**
   * Strip HTML and script tags from a string to prevent XSS.
   * Non-string values are returned as-is.
   * @param {*} value
   * @returns {*}
   */
  sanitise(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  },

  /**
   * Validate that a URL uses http or https protocol only.
   * Prevents javascript: and data: URI injection.
   * @param {string} url
   * @returns {boolean}
   */
  isValidUrl(url) {
    try {
      const { protocol } = new URL(url);
      return protocol === 'https:' || protocol === 'http:';
    } catch {
      return false;
    }
  },

  /**
   * Escape HTML entities then apply safe markdown transforms.
   * Always escape before rendering untrusted content into innerHTML.
   * @param {string} text - raw text (possibly from AI or user input)
   * @returns {string} safe HTML string
   */
  formatMessage(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  },

  /**
   * Round a number to a fixed number of decimal places and return as number.
   * @param {number} n
   * @param {number} [places=2]
   * @returns {number}
   */
  round(n, places = 2) {
    return +n.toFixed(places);
  },

  /**
   * Debounce a function — prevents excessive calls during rapid input.
   * @param {Function} fn
   * @param {number} delay - milliseconds
   * @returns {Function}
   */
  debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Format a number as a CO₂ tonne string with unit.
   * @param {number} value
   * @returns {string} e.g. "3.20 t CO₂"
   */
  formatCO2(value) {
    return `${Utils.round(value, 2).toFixed(2)} t CO₂`;
  },
});

/* ═══════════════════════════════════════════════════════════════
   DOM CACHE — single query per element, avoids repeated lookups
═══════════════════════════════════════════════════════════════ */

/** Lazily-populated cache of DOM element references */
const DOMCache = (() => {
  const _cache = {};
  return {
    /**
     * Get a cached element by id. Queries DOM only once per id.
     * @param {string} id
     * @returns {HTMLElement|null}
     */
    get(id) {
      if (!_cache[id]) _cache[id] = document.getElementById(id);
      return _cache[id];
    },
    /** Clear cache (useful for testing or dynamic DOM) */
    clear() { Object.keys(_cache).forEach(k => delete _cache[k]); },
  };
})();

/* ═══════════════════════════════════════════════════════════════
   EMISSION ENGINE — pure calculation, zero DOM dependencies
═══════════════════════════════════════════════════════════════ */

const EmissionEngine = Object.freeze({
  /**
   * Calculate annual home energy emissions in tonnes CO₂.
   * @param {Object} p
   * @param {number} p.monthlyBill - electricity bill in INR
   * @param {string} p.energySource - key in EMISSION_FACTORS.energy
   * @param {string} p.heating - key in EMISSION_FACTORS.heating
   * @returns {number} tonnes CO₂/year
   */
  calcHome({ monthlyBill, energySource, heating }) {
    const INR_PER_KWH = 8; // India avg residential tariff
    const kwh = monthlyBill / INR_PER_KWH;
    const energyFactor = EMISSION_FACTORS.energy[energySource] ?? EMISSION_FACTORS.energy.mixed;
    const heatingFactor = EMISSION_FACTORS.heating[heating] ?? 0;
    const total = (kwh * 12 * energyFactor / 1000) + heatingFactor;
    return Utils.round(Math.max(0, total));
  },

  /**
   * Calculate annual travel emissions in tonnes CO₂.
   * @param {Object} p
   * @param {string} p.carType - key in EMISSION_FACTORS.car
   * @param {number} p.kmPerWeek - weekly driving distance
   * @param {number} p.flightsShort - short-haul flights per year
   * @param {number} p.flightsLong - long-haul flights per year
   * @returns {number} tonnes CO₂/year
   */
  calcTravel({ carType, kmPerWeek, flightsShort, flightsLong }) {
    const carFactor = EMISSION_FACTORS.car[carType] ?? 0;
    const carEmissions = (kmPerWeek * 52 * carFactor) / 1000;
    const flightEmissions =
      flightsShort * EMISSION_FACTORS.flightShort +
      flightsLong  * EMISSION_FACTORS.flightLong;
    return Utils.round(Math.max(0, carEmissions + flightEmissions));
  },

  /**
   * Calculate annual food & diet emissions in tonnes CO₂.
   * @param {Object} p
   * @param {string} p.dietType - key in EMISSION_FACTORS.diet
   * @param {number} p.localFoodPct - % of food that is local (0–100)
   * @param {string} p.foodWaste - key in EMISSION_FACTORS.foodWaste
   * @returns {number} tonnes CO₂/year
   */
  calcFood({ dietType, localFoodPct, foodWaste }) {
    const base = EMISSION_FACTORS.diet[dietType] ?? EMISSION_FACTORS.diet.omnivore;
    const localSaving = -(localFoodPct / 100) * 0.3;
    const wasteAdj = EMISSION_FACTORS.foodWaste[foodWaste] ?? 0;
    return Utils.round(Math.max(0, base + localSaving + wasteAdj));
  },

  /**
   * Calculate annual shopping & lifestyle emissions in tonnes CO₂.
   * @param {Object} p
   * @param {number} p.newClothes - new garments purchased per year
   * @param {number} p.newElectronics - new devices purchased per year
   * @param {number} p.streamingHours - daily streaming hours
   * @param {string} p.recycling - key in EMISSION_FACTORS.recyclingBonus
   * @returns {number} tonnes CO₂/year
   */
  calcShopping({ newClothes, newElectronics, streamingHours, recycling }) {
    const clothingEmit   = newClothes    * EMISSION_FACTORS.clothing;
    const electronicsEmit = newElectronics * EMISSION_FACTORS.electronics;
    const streamingEmit  = (streamingHours * 365 * EMISSION_FACTORS.streaming) / 1000;
    const recycleBonus   = EMISSION_FACTORS.recyclingBonus[recycling] ?? 0;
    return Utils.round(Math.max(0, clothingEmit + electronicsEmit + streamingEmit + recycleBonus));
  },

  /**
   * Calculate full annual carbon footprint from raw form inputs.
   * Applies bounds clamping on all numeric inputs.
   * @param {Object} inputs - raw form values (strings or numbers)
   * @returns {{ total: number, home: number, travel: number, food: number, shopping: number }}
   */
  calculate(inputs = {}) {
    const n = (key) => Utils.clampNum(inputs[key], INPUT_LIMITS[key]?.min ?? 0, INPUT_LIMITS[key]?.max ?? Infinity);

    const home     = this.calcHome({
      monthlyBill:  n('monthly_bill'),
      energySource: inputs.energy_source || 'mixed',
      heating:      inputs.heating       || 'none',
    });
    const travel   = this.calcTravel({
      carType:      inputs.car_type     || 'none',
      kmPerWeek:    n('km_per_week'),
      flightsShort: n('flights_short'),
      flightsLong:  n('flights_long'),
    });
    const food     = this.calcFood({
      dietType:     inputs.diet_type  || 'omnivore',
      localFoodPct: n('local_food'),
      foodWaste:    inputs.food_waste || 'medium',
    });
    const shopping = this.calcShopping({
      newClothes:    n('new_clothes'),
      newElectronics: n('electronics'),
      streamingHours: n('streaming'),
      recycling:     inputs.recycling || 'most',
    });

    const total = Utils.round(home + travel + food + shopping);
    return { total, home, travel, food, shopping };
  },

  /**
   * Determine score level and label based on total CO₂.
   * @param {number} total
   * @returns {{ level: 'good'|'warn'|'bad', text: string, color: string }}
   */
  getScoreLabel(total) {
    if (total <= BENCHMARKS.parisTarget) return { level: 'good', text: '🌱 On target',    color: '#8FFF6A' };
    if (total <= BENCHMARKS.globalAvg)   return { level: 'warn', text: '⚠️ Above target', color: '#FFD166' };
    return                                       { level: 'bad',  text: '🔴 High impact',  color: '#FF6B6B' };
  },

  /**
   * Estimate potential saving if a specific tip is fully adopted.
   * @param {string} tipTitle
   * @returns {number} tonnes CO₂/year saved
   */
  getTipSaving(tipTitle) {
    return TIPS.find(t => t.title === tipTitle)?.saving ?? 0;
  },
});

/* ═══════════════════════════════════════════════════════════════
   PROGRESS TRACKER — localStorage footprint history
═══════════════════════════════════════════════════════════════ */

const ProgressTracker = (() => {
  const STORAGE_KEY = 'ecotrace_history';
  const MAX_ENTRIES = 12;

  /**
   * Save a footprint result to history.
   * @param {{ total: number, home: number, travel: number, food: number, shopping: number }} result
   */
  function save(result) {
    try {
      const history = load();
      history.push({ ...result, date: new Date().toISOString() });
      const trimmed = history.slice(-MAX_ENTRIES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // localStorage may be unavailable (private browsing, storage quota)
    }
  }

  /**
   * Load footprint history from localStorage.
   * @returns {Array<Object>}
   */
  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  /**
   * Get trend: positive = improving (footprint going down), negative = worsening.
   * @returns {number|null} change in tonnes from last entry, or null if < 2 entries
   */
  function getTrend() {
    const history = load();
    if (history.length < 2) return null;
    return Utils.round(history.at(-1).total - history.at(-2).total);
  }

  /**
   * Render the history trend badge into the results section.
   */
  function renderTrend() {
    const trend = getTrend();
    const el = DOMCache.get('trendBadge');
    if (!el || trend === null) return;

    const improved = trend < 0;
    el.textContent = improved
      ? `▼ ${Math.abs(trend)}t vs last time`
      : trend > 0 ? `▲ +${trend}t vs last time` : '= Same as last time';
    el.className = `trend-badge trend-badge--${improved ? 'good' : trend > 0 ? 'bad' : 'neutral'}`;
    el.hidden = false;
  }

  return Object.freeze({ save, load, getTrend, renderTrend });
})();

/* ═══════════════════════════════════════════════════════════════
   CALCULATOR CONTROLLER
═══════════════════════════════════════════════════════════════ */

const Calculator = (() => {
  const TOTAL_STEPS = 4;
  let currentStep = 1;

  /** @returns {number} current active step (1–4) */
  function getStep() { return currentStep; }

  /**
   * Navigate to a given step.
   * @param {number} n - target step (1–4)
   */
  function goToStep(n) {
    if (n < 1 || n > TOTAL_STEPS) return;
    DOMCache.get(`step${currentStep}`)?.classList.remove('active');
    currentStep = n;
    DOMCache.get(`step${n}`)?.classList.add('active');
    _updateProgress(n);
    DOMCache.get(`step${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /** @param {number} step */
  function _updateProgress(step) {
    const fill = DOMCache.get('progressFill');
    if (fill) fill.style.width = `${(step / TOTAL_STEPS) * 100}%`;

    const bar = document.querySelector('.calc-progress');
    if (bar) bar.setAttribute('aria-valuenow', step);

    document.querySelectorAll('.calc-progress__steps .step').forEach((s, i) => {
      s.classList.toggle('step--active', i + 1 === step);
    });
  }

  /**
   * Read all form values, sanitising string inputs.
   * @returns {Object} raw inputs map
   */
  function _readInputs() {
    const form = DOMCache.get('calcForm');
    if (!form) return {};
    const data = new FormData(form);
    const inputs = {};
    for (const [key, value] of data.entries()) {
      inputs[key] = Utils.sanitise(value);
    }
    // FormData doesn't capture unchecked radios; default diet_type if missing
    if (!inputs.diet_type) inputs.diet_type = 'omnivore';
    return inputs;
  }

  /** Run calculation and display results */
  function calculate() {
    const inputs = _readInputs();
    const result = EmissionEngine.calculate(inputs);
    window._calculatorResult = result; // expose for AI context
    ProgressTracker.save(result);
    ResultsRenderer.display(result);
  }

  /** Reset form to initial state */
  function reset() {
    const form    = DOMCache.get('calcForm');
    const results = DOMCache.get('results');
    if (form)    { form.style.display = ''; form.reset(); }
    if (results) results.hidden = true;

    DOMCache.get('localFoodVal').textContent = '30%';
    goToStep(1);
  }

  return Object.freeze({ getStep, goToStep, calculate, reset });
})();

// Global shims for inline HTML onclick handlers
function nextStep(n)         { Calculator.goToStep(n); }
function prevStep(n)         { Calculator.goToStep(n); }
function calculateFootprint(){ Calculator.calculate(); }
function resetCalc()         { Calculator.reset(); }

/* ═══════════════════════════════════════════════════════════════
   RESULTS RENDERER
═══════════════════════════════════════════════════════════════ */

const ResultsRenderer = Object.freeze({
  /**
   * Animate a numeric counter from 0 to target using easing.
   * @param {HTMLElement} el
   * @param {number} target
   * @param {number} [decimals=0]
   */
  animateCounter(el, target, decimals = 0) {
    if (!el) return;
    const duration = 1800;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      el.textContent = (eased * target).toFixed(decimals);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  /**
   * Display the full results section from a calculation result.
   * @param {{ total: number, home: number, travel: number, food: number, shopping: number }} data
   */
  display(data) {
    const form    = DOMCache.get('calcForm');
    const results = DOMCache.get('results');
    if (!form || !results) return;

    form.style.display = 'none';
    results.hidden = false;

    // Date stamp
    const dateEl = DOMCache.get('results__date');
    if (dateEl) dateEl.textContent = `Calculated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    // Score ring
    const ringFill = DOMCache.get('ringFill');
    if (ringFill) {
      const CIRCUMFERENCE = 502;
      const pct = Math.min(data.total / 10, 1);
      const { color } = EmissionEngine.getScoreLabel(data.total);
      setTimeout(() => {
        ringFill.style.strokeDashoffset = CIRCUMFERENCE - (pct * CIRCUMFERENCE);
        ringFill.style.stroke = color;
      }, 100);
    }

    this.animateCounter(DOMCache.get('totalScore'), data.total, 1);

    // Score label
    const label = DOMCache.get('scoreLabel');
    if (label) {
      const { text, color } = EmissionEngine.getScoreLabel(data.total);
      label.textContent = text;
      label.style.color = color;
    }

    this._renderBreakdown(data);
    this._renderComparisons(data.total);
    this._renderTopTips(data);
    ProgressTracker.renderTrend();

    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  /** @param {Object} data */
  _renderBreakdown(data) {
    const container = DOMCache.get('breakdownBars');
    if (!container) return;

    const categories = [
      { label: 'Home',     val: data.home,     color: '#64B6FF' },
      { label: 'Travel',   val: data.travel,   color: '#FFD166' },
      { label: 'Food',     val: data.food,     color: '#8FFF6A' },
      { label: 'Shopping', val: data.shopping, color: '#FF9F6B' },
    ];
    const max = Math.max(...categories.map(c => c.val), 0.1);

    const fragment = document.createDocumentFragment();
    categories.forEach(({ label, val, color }) => {
      const pctW = Math.round((val / max) * 100);
      const bar = document.createElement('div');
      bar.className = 'breakdown-bar';
      bar.setAttribute('role', 'listitem');
      bar.setAttribute('aria-label', `${label}: ${Utils.formatCO2(val)}`);

      // Safe: label/val/color are internal constants — no user input interpolated here
      bar.innerHTML = `
        <span class="breakdown-bar__label">${label}</span>
        <div class="breakdown-bar__track">
          <div class="breakdown-bar__fill" style="width:0%;background:${color}" data-target="${pctW}"></div>
        </div>
        <span class="breakdown-bar__val">${val}t</span>`;
      fragment.appendChild(bar);
    });

    container.innerHTML = '';
    container.appendChild(fragment);

    // Animate on next frame to ensure transition triggers
    requestAnimationFrame(() => {
      container.querySelectorAll('.breakdown-bar__fill').forEach(el => {
        el.style.width = `${el.dataset.target}%`;
      });
    });
  },

  /** @param {number} total */
  _renderComparisons(total) {
    const vsGlobal = Utils.round(total - BENCHMARKS.globalAvg, 1);
    const vsParis  = Utils.round(total - BENCHMARKS.parisTarget, 1);

    const globalEl = DOMCache.get('globalDiff');
    const parisEl  = DOMCache.get('parisDiff');

    if (globalEl) {
      globalEl.textContent = vsGlobal > 0 ? `+${vsGlobal}t` : `${vsGlobal}t`;
      globalEl.className = `compare-card__diff ${vsGlobal > 0 ? 'diff--bad' : 'diff--good'}`;
    }
    if (parisEl) {
      parisEl.textContent = vsParis > 0 ? `+${vsParis}t` : `${vsParis}t`;
      parisEl.className = `compare-card__diff ${vsParis > 0 ? 'diff--bad' : vsParis > -1 ? 'diff--ok' : 'diff--good'}`;
    }
  },

  /**
   * Show the top 3 highest-impact personalised tips below results.
   * @param {Object} data - breakdown by category
   */
  _renderTopTips(data) {
    const container = DOMCache.get('resultsTopTips');
    if (!container) return;

    // Pick highest-impact tips weighted by the user's biggest categories
    const categoryOrder = Object.entries({ home: data.home, travel: data.travel, food: data.food, shopping: data.shopping })
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);

    const topTips = [];
    for (const cat of categoryOrder) {
      const catTips = TIPS.filter(t => t.cat === cat && t.impact === 'high');
      topTips.push(...catTips);
      if (topTips.length >= 3) break;
    }
    const display = topTips.slice(0, 3);

    container.innerHTML = display.length
      ? `<h4 class="top-tips__heading">Your top 3 actions (saves up to ${Utils.round(display.reduce((s, t) => s + t.saving, 0), 1)}t CO₂/yr)</h4>
         <div class="top-tips__list">${display.map(t => `
           <div class="top-tip">
             <span class="top-tip__icon">${t.icon}</span>
             <div>
               <strong>${t.title}</strong>
               <span class="top-tip__saving">−${t.saving}t/yr</span>
             </div>
           </div>`).join('')}
         </div>`
      : '';
  },
});

/* ═══════════════════════════════════════════════════════════════
   TIPS CONTROLLER
═══════════════════════════════════════════════════════════════ */

const TipsController = Object.freeze({
  /**
   * Filter tips by category and re-render the grid.
   * @param {string} category - 'all' or a valid category key
   * @param {HTMLElement} activeBtn - the clicked filter button
   */
  filter(category, activeBtn) {
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-pressed', 'true');
    this.render(category);
  },

  /**
   * Render tips for a given category into the tips grid.
   * Sorted by impact (high → medium → low) then by saving value.
   * @param {string} [category='all']
   */
  render(category = 'all') {
    const grid = DOMCache.get('tipsGrid');
    if (!grid) return;

    const impactOrder = { high: 0, medium: 1, low: 2 };
    const filtered = (category === 'all' ? [...TIPS] : TIPS.filter(t => t.cat === category))
      .sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact] || b.saving - a.saving);

    const fragment = document.createDocumentFragment();
    filtered.forEach(tip => {
      const card = document.createElement('div');
      card.className = 'tip-card';
      card.setAttribute('role', 'listitem');
      card.innerHTML = `
        <div class="tip-card__icon" aria-hidden="true">${tip.icon}</div>
        <div class="tip-card__body">
          <h4>${tip.title}</h4>
          <p>${tip.desc}</p>
          <div class="tip-card__meta">
            <span class="tip-card__impact impact--${tip.impact}">${tip.impact.toUpperCase()} IMPACT</span>
            <span class="tip-card__saving">Saves ~${tip.saving}t CO₂/yr</span>
          </div>
        </div>`;
      fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
  },
});

// Global shim for inline HTML onclick
function filterTips(cat, btn) { TipsController.filter(cat, btn); }

/* ═══════════════════════════════════════════════════════════════
   CHAT CONTROLLER
═══════════════════════════════════════════════════════════════ */

const ChatController = (() => {
  const MAX_HISTORY   = 20;   // cap conversation context to control token usage
  const RATE_LIMIT_MS = 1500; // min ms between requests
  const SYSTEM_PROMPT = `You are EcoTrace, a knowledgeable and friendly carbon footprint assistant.
Your job is to help users understand their environmental impact and give concrete, actionable advice to reduce it.

Guidelines:
- Be conversational, clear, and encouraging — not preachy or alarmist
- Cite specific sources (IPCC, OurWorldInData, DEFRA) where relevant
- Tailor advice to be practical; acknowledge that many users are from India
- Keep responses concise (3–5 sentences) unless a longer answer genuinely helps
- Use at most one emoji per response
- Never lecture — offer alternatives, not judgements
- If calculator results are provided in context, reference them specifically

Your expertise: carbon footprints by category, climate science, renewable energy, sustainable transport,
food emissions, circular economy, Paris Agreement, scope 1/2/3 emissions, personal vs systemic change,
carbon offsets and their limitations, green finance, and climate policy.`;

  let history   = [];
  let isWaiting = false;
  let lastSent  = 0;

  /** @param {'user'|'assistant'} role @param {string} content */
  function appendMessage(role, content) {
    const messages = DOMCache.get('chatMessages');
    if (!messages) return;

    if (role === 'user') {
      messages.querySelector('.chat__suggestions')?.remove();
    }

    const div = document.createElement('div');
    div.className = `chat__message chat__message--${role === 'assistant' ? 'assistant' : 'user'}`;

    const avatar = document.createElement('div');
    avatar.className = 'chat__avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = role === 'assistant' ? '◈' : '👤';

    const bubble = document.createElement('div');
    bubble.className = 'chat__bubble';
    bubble.innerHTML = Utils.formatMessage(content); // XSS-safe

    div.appendChild(avatar);
    div.appendChild(bubble);
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function showTyping() {
    const messages = DOMCache.get('chatMessages');
    if (!messages) return;
    const div = document.createElement('div');
    div.className = 'chat__message chat__message--assistant';
    div.id = 'typingIndicator';
    div.setAttribute('aria-label', 'Assistant is typing');
    div.innerHTML = `
      <div class="chat__avatar" aria-hidden="true">◈</div>
      <div class="chat__bubble">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTyping() {
    document.getElementById('typingIndicator')?.remove();
  }

  /** Build enriched system prompt with user's footprint context if available */
  function buildSystemPrompt() {
    const result = window._calculatorResult;
    if (!result) return SYSTEM_PROMPT;
    return `${SYSTEM_PROMPT}\n\nUser's current footprint: Total ${result.total}t CO₂/yr` +
      ` (Home: ${result.home}t | Travel: ${result.travel}t | Food: ${result.food}t | Shopping: ${result.shopping}t).` +
      ` Their biggest category is ${Object.entries({ home: result.home, travel: result.travel, food: result.food, shopping: result.shopping })
          .sort((a, b) => b[1] - a[1])[0][0]}.`;
  }

  async function send(text) {
    if (isWaiting) return;
    const now = Date.now();
    if (now - lastSent < RATE_LIMIT_MS) return;
    lastSent = now;

    const sanitised = Utils.sanitise(text).slice(0, 2000); // cap message length
    if (!sanitised) return;

    appendMessage('user', sanitised);
    history.push({ role: 'user', content: sanitised });
    // Trim history to avoid exceeding context window
    if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

    isWaiting = true;
    const sendBtn = DOMCache.get('chatSendBtn');
    if (sendBtn) sendBtn.disabled = true;
    showTyping();

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:      'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system:     buildSystemPrompt(),
          messages:   history,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `HTTP ${response.status}`);
      }

      const data  = await response.json();
      const reply = data.content?.find(b => b.type === 'text')?.text ?? 'Sorry, no response received.';

      removeTyping();
      appendMessage('assistant', reply);
      history.push({ role: 'assistant', content: reply });

    } catch (err) {
      removeTyping();
      appendMessage('assistant', 'I\'m having trouble connecting right now. Please try again in a moment.');
      console.error('[EcoTrace] Chat error:', err.message);
    } finally {
      isWaiting = false;
      if (sendBtn) sendBtn.disabled = false;
      DOMCache.get('chatInput')?.focus();
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const input = DOMCache.get('chatInput');
      if (input) { send(input.value); input.value = ''; input.style.height = 'auto'; }
    }
    _autoResizeTextarea(e.target);
  }

  function _autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return Object.freeze({ send, handleKeydown });
})();

// Global shims for inline HTML
function sendMessage() {
  const input = DOMCache.get('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  ChatController.send(text);
}
function sendSuggestion(btn) {
  ChatController.send(btn.textContent.trim());
}
function handleChatKeydown(e) {
  ChatController.handleKeydown(e);
}

/* ═══════════════════════════════════════════════════════════════
   HERO COUNTER ANIMATION
═══════════════════════════════════════════════════════════════ */

function initCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      const value    = parseFloat(target.dataset.target);
      const decimals = value % 1 !== 0 ? 1 : 0;
      ResultsRenderer.animateCounter(target, value, decimals);
      observer.unobserve(target);
    });
  }, { threshold: 0.5 });

  document.querySelectorAll('.stat__number').forEach(el => observer.observe(el));
}

/* ═══════════════════════════════════════════════════════════════
   INITIALISATION
═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  initCounters();
  TipsController.render();

  // Auto-resize chat textarea on input (debounced for efficiency)
  const chatInput = DOMCache.get('chatInput');
  if (chatInput) {
    chatInput.addEventListener('input', Utils.debounce(() => {
      chatInput.style.height = 'auto';
      chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
    }, 50));
  }

  // Expose calculator result globally for AI context
  const _origDisplay = ResultsRenderer.display.bind(ResultsRenderer);
  // Intercept to store result for AI context
  Object.defineProperty(window, '_calculatorResult', { writable: true, value: null });
});
