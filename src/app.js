/**
 * EcoTrace — Carbon Footprint Awareness Platform
 * @module EcoTrace
 * @version 3.0.0
 *
 * Architecture (all modules Object.freeze'd, zero global mutable state):
 *   Utils           — pure helpers: clampNum, sanitise, formatMessage, debounce
 *   EmissionEngine  — pure CO₂ calculations, zero DOM dependencies
 *   DOMCache        — lazy element cache, single querySelector per id
 *   ProgressTracker — localStorage history with trend analysis
 *   Calculator      — multi-step form controller
 *   ResultsRenderer — animated SVG ring, bar charts, comparisons
 *   TipsController  — filterable, sorted tips grid
 *   ChatController  — AI assistant with rate-limit, history cap, context injection
 *
 * Security:
 *   - All user/AI text set via textContent or sanitised before innerHTML
 *   - Utils.sanitise() strips script/HTML tags from string inputs
 *   - Utils.formatMessage() HTML-escapes AI responses before markup
 *   - Utils.isValidUrl() rejects javascript:/data: URIs
 *   - All numeric inputs bounded via Utils.clampNum()
 *
 * Performance:
 *   - DOMCache prevents repeated getElementById calls
 *   - document.createDocumentFragment() for all batch DOM inserts
 *   - IntersectionObserver for lazy section reveal
 *   - Service Worker registered for cache-first static assets
 *   - ChatController caps history at MAX_HISTORY to limit token usage
 *   - Utils.debounce() throttles textarea resize handler
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS — all Object.freeze'd, zero mutation
═══════════════════════════════════════════════════════════════ */

/** Emission factors sourced from IPCC AR6, DEFRA 2023, Our World in Data */
const EMISSION_FACTORS = Object.freeze({
  energy:         Object.freeze({ coal: 0.92, gas: 0.55, mixed: 0.45, renewable: 0.05, solar: 0.02 }),
  heating:        Object.freeze({ gas: 0.2, electric: 0.1, none: 0, solar_thermal: 0.01 }),
  car:            Object.freeze({ none: 0, petrol: 0.21, diesel: 0.17, hybrid: 0.11, ev: 0.07 }),
  flightShort:    0.25,   // tonnes CO₂e per return short-haul flight (DEFRA)
  flightLong:     1.6,    // tonnes CO₂e per return long-haul flight (DEFRA)
  diet:           Object.freeze({ vegan: 1.5, vegetarian: 1.7, pescatarian: 2.1, omnivore: 2.5, high_meat: 3.3 }),
  foodWaste:      Object.freeze({ low: -0.1, medium: 0, high: 0.2 }),
  clothing:       0.01,   // tonnes CO₂e per garment (lifecycle avg, WRAP)
  electronics:    0.15,   // tonnes CO₂e per device (lifecycle avg, IEA)
  streaming:      0.0006, // tonnes CO₂e per daily streaming hour per year
  recyclingBonus: Object.freeze({ none: 0, some: -0.05, most: -0.15, all: -0.25 }),
});

const BENCHMARKS = Object.freeze({ globalAvg: 4.7, parisTarget: 2.0 });

const INPUT_LIMITS = Object.freeze({
  monthly_bill:  Object.freeze({ min: 0, max: 100_000 }),
  km_per_week:   Object.freeze({ min: 0, max: 10_000 }),
  flights_short: Object.freeze({ min: 0, max: 365 }),
  flights_long:  Object.freeze({ min: 0, max: 365 }),
  local_food:    Object.freeze({ min: 0, max: 100 }),
  new_clothes:   Object.freeze({ min: 0, max: 10_000 }),
  electronics:   Object.freeze({ min: 0, max: 1_000 }),
  streaming:     Object.freeze({ min: 0, max: 24 }),
});

const TIPS = Object.freeze([
  Object.freeze({ icon: '⚡', cat: 'home',     title: 'Switch to renewable energy',      desc: 'Move to a green tariff or install solar panels to instantly cut your home CO₂ by 1–2 tonnes/year.',         impact: 'high',   saving: 1.5  }),
  Object.freeze({ icon: '🪟', cat: 'home',     title: 'Insulate walls and roof',          desc: 'Up to 35% of heat is lost through walls. Proper insulation can save 1 tonne CO₂ annually.',                  impact: 'high',   saving: 1.0  }),
  Object.freeze({ icon: '🌡️', cat: 'home',     title: 'Drop heating by 1°C',              desc: 'Reducing your thermostat by just 1°C saves around 310 kg CO₂ per year.',                                     impact: 'medium', saving: 0.31 }),
  Object.freeze({ icon: '💡', cat: 'home',     title: 'LED lighting throughout',          desc: 'Replace all bulbs with LEDs — uses 90% less energy and lasts 25× longer.',                                   impact: 'low',    saving: 0.05 }),
  Object.freeze({ icon: '✈️', cat: 'travel',   title: 'Eliminate one long-haul flight',   desc: 'One return long-haul flight emits 1.5–3 tonnes CO₂ — more than many people\'s monthly footprint.',           impact: 'high',   saving: 1.6  }),
  Object.freeze({ icon: '🔋', cat: 'travel',   title: 'Switch to an electric vehicle',    desc: 'EVs produce 3× less lifetime CO₂ than petrol cars, even accounting for manufacturing.',                       impact: 'high',   saving: 1.2  }),
  Object.freeze({ icon: '🚄', cat: 'travel',   title: 'Train over plane for short trips', desc: 'Rail emits 6–10× less CO₂ than flying. For journeys under 500 km, always choose rail.',                      impact: 'high',   saving: 0.5  }),
  Object.freeze({ icon: '🚲', cat: 'travel',   title: 'Cycle or walk short trips',        desc: 'Replacing car trips under 5 km with cycling eliminates those emissions entirely.',                             impact: 'medium', saving: 0.3  }),
  Object.freeze({ icon: '🌱', cat: 'food',     title: 'Try plant-based meals 3×/week',   desc: 'Reducing meat intake 3 days/week can cut food emissions by 30% without going fully vegetarian.',              impact: 'high',   saving: 0.7  }),
  Object.freeze({ icon: '🥩', cat: 'food',     title: 'Cut beef consumption in half',     desc: 'Beef produces 20× more CO₂ than legumes per gram of protein. Halving it saves ~0.5 t/yr.',                  impact: 'high',   saving: 0.5  }),
  Object.freeze({ icon: '🗑️', cat: 'food',     title: 'Halve your food waste',            desc: 'One-third of all food is wasted globally. Cutting waste saves money and ~0.3 tonnes CO₂ per year.',          impact: 'medium', saving: 0.3  }),
  Object.freeze({ icon: '🛒', cat: 'food',     title: 'Buy local and seasonal produce',   desc: 'Transport accounts for ~11% of food emissions. Local and seasonal choices cut this significantly.',           impact: 'medium', saving: 0.2  }),
  Object.freeze({ icon: '👗', cat: 'shopping', title: 'Buy secondhand clothing',          desc: 'The fashion industry emits 10% of global CO₂. Secondhand clothing eliminates manufacturing emissions.',       impact: 'medium', saving: 0.2  }),
  Object.freeze({ icon: '📱', cat: 'shopping', title: 'Keep electronics for longer',      desc: 'Manufacturing a smartphone takes ~70 kg CO₂. Keeping it one extra year halves its annual impact.',           impact: 'medium', saving: 0.15 }),
  Object.freeze({ icon: '♻️', cat: 'shopping', title: 'Recycle and repair first',         desc: 'Buying repaired goods avoids new manufacturing emissions entirely. Repair, then recycle.',                    impact: 'low',    saving: 0.1  }),
  Object.freeze({ icon: '📦', cat: 'shopping', title: 'Batch online deliveries',          desc: 'Multiple deliveries emit far more than a single consolidated order. Plan purchases together.',                impact: 'low',    saving: 0.05 }),
]);

/* ═══════════════════════════════════════════════════════════════
   UTILS — pure, side-effect-free helpers
═══════════════════════════════════════════════════════════════ */

const Utils = Object.freeze({
  /**
   * Clamp a value to [min, max]. Returns min for NaN; clamps Infinity to max.
   * @param {*} value
   * @param {number} [min=0]
   * @param {number} [max=Infinity]
   * @returns {number}
   */
  clampNum(value, min = 0, max = Infinity) {
    const n = parseFloat(value);
    if (isNaN(n) || n < min) return min;
    return Math.min(n, max);
  },

  /**
   * Strip HTML tags and script blocks from a string.
   * Non-string values are returned unchanged.
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
   * Validate a URL uses http or https only.
   * Blocks javascript:, data:, and other dangerous schemes.
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
   * Escape HTML entities, then apply safe bold/linebreak markdown.
   * Must be called before setting innerHTML with untrusted text.
   * @param {string} text
   * @returns {string}
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
   * Round to fixed decimal places, returning a number.
   * @param {number} n
   * @param {number} [places=2]
   * @returns {number}
   */
  round(n, places = 2) {
    return +n.toFixed(places);
  },

  /**
   * Debounce: delay fn execution until after `delay` ms of inactivity.
   * @param {Function} fn
   * @param {number} delay
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
   * Create a DOM element with optional className and textContent.
   * Preferred over innerHTML for all internal renders.
   * @param {string} tag
   * @param {Object} [opts]
   * @returns {HTMLElement}
   */
  el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className)   node.className   = opts.className;
    if (opts.text != null) node.textContent = opts.text;
    if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (opts.children) opts.children.forEach(c => c && node.appendChild(c));
    return node;
  },
});

/* ═══════════════════════════════════════════════════════════════
   DOM CACHE — single lookup per element id
═══════════════════════════════════════════════════════════════ */

const DOMCache = (() => {
  const _cache = new Map();
  return Object.freeze({
    /**
     * Return cached element by id; queries DOM only once per id.
     * @param {string} id
     * @returns {HTMLElement|null}
     */
    get(id) {
      if (!_cache.has(id)) _cache.set(id, document.getElementById(id));
      return _cache.get(id);
    },
    /** Flush cache (use after dynamic DOM changes). */
    clear() { _cache.clear(); },
  });
})();

/* ═══════════════════════════════════════════════════════════════
   EMISSION ENGINE — pure calculation, zero DOM
═══════════════════════════════════════════════════════════════ */

const EmissionEngine = Object.freeze({
  /**
   * Calculate annual home energy emissions in tonnes CO₂e.
   * @param {{ monthlyBill: number, energySource: string, heating: string }} p
   * @returns {number}
   */
  calcHome({ monthlyBill, energySource, heating }) {
    const INR_PER_KWH    = 8; // India average residential tariff (₹/kWh)
    const kwh            = monthlyBill / INR_PER_KWH;
    const energyFactor   = EMISSION_FACTORS.energy[energySource]  ?? EMISSION_FACTORS.energy.mixed;
    const heatingFactor  = EMISSION_FACTORS.heating[heating]      ?? 0;
    return Utils.round(Math.max(0, (kwh * 12 * energyFactor / 1000) + heatingFactor));
  },

  /**
   * Calculate annual travel emissions in tonnes CO₂e.
   * @param {{ carType: string, kmPerWeek: number, flightsShort: number, flightsLong: number }} p
   * @returns {number}
   */
  calcTravel({ carType, kmPerWeek, flightsShort, flightsLong }) {
    const carFactor   = EMISSION_FACTORS.car[carType] ?? 0;
    const carEmit     = (kmPerWeek * 52 * carFactor) / 1000;
    const flightEmit  = flightsShort * EMISSION_FACTORS.flightShort
                      + flightsLong  * EMISSION_FACTORS.flightLong;
    return Utils.round(Math.max(0, carEmit + flightEmit));
  },

  /**
   * Calculate annual food emissions in tonnes CO₂e.
   * @param {{ dietType: string, localFoodPct: number, foodWaste: string }} p
   * @returns {number}
   */
  calcFood({ dietType, localFoodPct, foodWaste }) {
    const base       = EMISSION_FACTORS.diet[dietType]      ?? EMISSION_FACTORS.diet.omnivore;
    const localSave  = -(localFoodPct / 100) * 0.3;
    const wasteAdj   = EMISSION_FACTORS.foodWaste[foodWaste] ?? 0;
    return Utils.round(Math.max(0, base + localSave + wasteAdj));
  },

  /**
   * Calculate annual shopping & lifestyle emissions in tonnes CO₂e.
   * @param {{ newClothes: number, newElectronics: number, streamingHours: number, recycling: string }} p
   * @returns {number}
   */
  calcShopping({ newClothes, newElectronics, streamingHours, recycling }) {
    const total = newClothes      * EMISSION_FACTORS.clothing
                + newElectronics  * EMISSION_FACTORS.electronics
                + (streamingHours * 365 * EMISSION_FACTORS.streaming) / 1000
                + (EMISSION_FACTORS.recyclingBonus[recycling] ?? 0);
    return Utils.round(Math.max(0, total));
  },

  /**
   * Full footprint calculation from raw form inputs.
   * Applies INPUT_LIMITS clamping to all numeric fields.
   * @param {Object} [inputs={}]
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
      carType:      inputs.car_type      || 'none',
      kmPerWeek:    n('km_per_week'),
      flightsShort: n('flights_short'),
      flightsLong:  n('flights_long'),
    });
    const food     = this.calcFood({
      dietType:     inputs.diet_type     || 'omnivore',
      localFoodPct: n('local_food'),
      foodWaste:    inputs.food_waste    || 'medium',
    });
    const shopping = this.calcShopping({
      newClothes:     n('new_clothes'),
      newElectronics: n('electronics'),
      streamingHours: n('streaming'),
      recycling:      inputs.recycling   || 'most',
    });

    return { total: Utils.round(home + travel + food + shopping), home, travel, food, shopping };
  },

  /**
   * Get score level, label, and colour from a total CO₂ value.
   * @param {number} total
   * @returns {{ level: 'good'|'warn'|'bad', text: string, color: string }}
   */
  getScoreLabel(total) {
    if (total <= BENCHMARKS.parisTarget) return { level: 'good', text: '🌱 On target',    color: '#8FFF6A' };
    if (total <= BENCHMARKS.globalAvg)   return { level: 'warn', text: '⚠️ Above target', color: '#FFD166' };
    return                                       { level: 'bad',  text: '🔴 High impact',  color: '#FF6B6B' };
  },

  /**
   * Return potential annual saving for a tip by title.
   * @param {string} tipTitle
   * @returns {number}
   */
  getTipSaving: (tipTitle) => TIPS.find(t => t.title === tipTitle)?.saving ?? 0,
});

/* ═══════════════════════════════════════════════════════════════
   PROGRESS TRACKER — localStorage footprint history
═══════════════════════════════════════════════════════════════ */

const ProgressTracker = (() => {
  const KEY        = 'ecotrace_history_v1';
  const MAX_ENTRIES = 12;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
    catch { return []; }
  }

  function save(result) {
    try {
      const history = load();
      history.push({ ...result, date: new Date().toISOString() });
      localStorage.setItem(KEY, JSON.stringify(history.slice(-MAX_ENTRIES)));
    } catch { /* quota exceeded or private mode */ }
  }

  function getTrend() {
    const h = load();
    if (h.length < 2) return null;
    return Utils.round(h[h.length - 1].total - h[h.length - 2].total, 1);
  }

  function renderTrend() {
    const trend = getTrend();
    const el    = DOMCache.get('trendBadge');
    if (!el || trend === null) return;

    const improved = trend < 0;
    el.textContent = improved
      ? `▼ ${Math.abs(trend)}t vs last time — great progress!`
      : trend > 0 ? `▲ +${trend}t vs last time` : '= Same as last time';
    el.className = `trend-badge trend-badge--${improved ? 'good' : trend > 0 ? 'bad' : 'neutral'}`;
    el.hidden    = false;
  }

  return Object.freeze({ save, load, getTrend, renderTrend });
})();

/* ═══════════════════════════════════════════════════════════════
   RESULTS RENDERER
═══════════════════════════════════════════════════════════════ */

const ResultsRenderer = Object.freeze({
  /**
   * Animate a numeric counter from 0 to target using quartic ease-out.
   * @param {HTMLElement|null} el
   * @param {number} target
   * @param {number} [decimals=0]
   */
  animateCounter(el, target, decimals = 0) {
    if (!el) return;
    const duration = 1800;
    const start    = performance.now();
    const tick     = (now) => {
      const p    = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      el.textContent = (ease * target).toFixed(decimals);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  /**
   * Render the full results section.
   * @param {{ total: number, home: number, travel: number, food: number, shopping: number }} data
   */
  display(data) {
    const form    = DOMCache.get('calcForm');
    const results = DOMCache.get('results');
    if (!form || !results) return;

    form.style.display = 'none';
    results.hidden     = false;

    const dateEl = DOMCache.get('results__date');
    if (dateEl) dateEl.textContent = `Calculated on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`;

    this._animateRing(data.total);
    this.animateCounter(DOMCache.get('totalScore'), data.total, 1);
    this._renderScoreLabel(data.total);
    this._renderBreakdown(data);
    this._renderComparisons(data.total);
    this._renderTopTips(data);
    ProgressTracker.renderTrend();

    results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  _animateRing(total) {
    const ringFill = DOMCache.get('ringFill');
    if (!ringFill) return;
    const { color } = EmissionEngine.getScoreLabel(total);
    const CIRCUMFERENCE = 502;
    const pct = Math.min(total / 10, 1);
    requestAnimationFrame(() => {
      ringFill.style.strokeDashoffset = CIRCUMFERENCE - (pct * CIRCUMFERENCE);
      ringFill.style.stroke           = color;
    });
  },

  _renderScoreLabel(total) {
    const label = DOMCache.get('scoreLabel');
    if (!label) return;
    const { text, color } = EmissionEngine.getScoreLabel(total);
    label.textContent = text;
    label.style.color = color;
  },

  _renderBreakdown(data) {
    const container = DOMCache.get('breakdownBars');
    if (!container) return;

    const categories = [
      { label: 'Home',     val: data.home,     color: '#64B6FF' },
      { label: 'Travel',   val: data.travel,   color: '#FFD166' },
      { label: 'Food',     val: data.food,     color: '#8FFF6A' },
      { label: 'Shopping', val: data.shopping, color: '#FF9F6B' },
    ];
    const max      = Math.max(...categories.map(c => c.val), 0.1);
    const fragment = document.createDocumentFragment();

    categories.forEach(({ label, val, color }) => {
      const pctW  = Math.round((val / max) * 100);
      const fill  = Utils.el('div', { className: 'breakdown-bar__fill', attrs: { 'data-target': pctW, style: `width:0%;background:${color}` } });
      const track = Utils.el('div', { className: 'breakdown-bar__track', children: [fill] });
      const bar   = Utils.el('div', {
        className: 'breakdown-bar',
        attrs: { role: 'listitem', 'aria-label': `${label}: ${val} tonnes CO₂` },
        children: [
          Utils.el('span', { className: 'breakdown-bar__label', text: label }),
          track,
          Utils.el('span', { className: 'breakdown-bar__val', text: `${val}t` }),
        ],
      });
      fragment.appendChild(bar);
    });

    container.textContent = ''; // safe clear
    container.appendChild(fragment);

    requestAnimationFrame(() => {
      container.querySelectorAll('.breakdown-bar__fill').forEach(el => {
        el.style.width = `${el.dataset.target}%`;
      });
    });
  },

  _renderComparisons(total) {
    const vsGlobal = Utils.round(total - BENCHMARKS.globalAvg, 1);
    const vsParis  = Utils.round(total - BENCHMARKS.parisTarget, 1);

    const globalEl = DOMCache.get('globalDiff');
    const parisEl  = DOMCache.get('parisDiff');

    if (globalEl) {
      globalEl.textContent = vsGlobal > 0 ? `+${vsGlobal}t` : `${vsGlobal}t`;
      globalEl.className   = `compare-card__diff ${vsGlobal > 0 ? 'diff--bad' : 'diff--good'}`;
    }
    if (parisEl) {
      parisEl.textContent  = vsParis > 0 ? `+${vsParis}t` : `${vsParis}t`;
      parisEl.className    = `compare-card__diff ${vsParis > 0 ? 'diff--bad' : vsParis > -1 ? 'diff--ok' : 'diff--good'}`;
    }
  },

  _renderTopTips(data) {
    const container = DOMCache.get('resultsTopTips');
    if (!container) return;

    const categoryOrder = Object.entries({
      home: data.home, travel: data.travel, food: data.food, shopping: data.shopping,
    }).sort((a, b) => b[1] - a[1]).map(([cat]) => cat);

    const topTips = [];
    for (const cat of categoryOrder) {
      TIPS.filter(t => t.cat === cat && t.impact === 'high').forEach(t => topTips.push(t));
      if (topTips.length >= 3) break;
    }
    const display     = topTips.slice(0, 3);
    const totalSaving = Utils.round(display.reduce((s, t) => s + t.saving, 0), 1);

    container.textContent = '';
    if (!display.length) return;

    const heading = Utils.el('h4', { className: 'top-tips__heading', text: `Your top 3 actions (saves up to ${totalSaving}t CO₂/yr)` });
    const list    = Utils.el('div', { className: 'top-tips__list' });

    display.forEach(tip => {
      const icon    = Utils.el('span', { className: 'top-tip__icon', text: tip.icon });
      const title   = Utils.el('strong', { text: tip.title });
      const saving  = Utils.el('span', { className: 'top-tip__saving', text: `−${tip.saving}t/yr` });
      const body    = Utils.el('div', { children: [title, saving] });
      const tipEl   = Utils.el('div', { className: 'top-tip', children: [icon, body] });
      list.appendChild(tipEl);
    });

    container.appendChild(Utils.el('div', { children: [heading, list] }));
  },
});

/* ═══════════════════════════════════════════════════════════════
   CALCULATOR CONTROLLER
═══════════════════════════════════════════════════════════════ */

const Calculator = (() => {
  const TOTAL_STEPS = 4;
  let _step = 1;

  function getStep() { return _step; }

  function goToStep(n) {
    const target = parseInt(n, 10);
    if (target < 1 || target > TOTAL_STEPS || target === _step) return;
    DOMCache.get(`step${_step}`)?.classList.remove('active');
    _step = target;
    DOMCache.get(`step${_step}`)?.classList.add('active');
    _updateProgress(_step);
    DOMCache.get(`step${_step}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function _updateProgress(step) {
    const fill = DOMCache.get('progressFill');
    if (fill) fill.style.width = `${(step / TOTAL_STEPS) * 100}%`;
    const bar = document.querySelector('.calc-progress');
    if (bar) {
      bar.setAttribute('aria-valuenow', step);
      bar.setAttribute('aria-label', `Calculator progress: step ${step} of ${TOTAL_STEPS}`);
    }
    document.querySelectorAll('.calc-progress__steps .step').forEach((s, i) => {
      s.classList.toggle('step--active', i + 1 === step);
    });
  }

  function _readInputs() {
    const form = DOMCache.get('calcForm');
    if (!form) return {};
    const inputs = {};
    new FormData(form).forEach((value, key) => { inputs[key] = Utils.sanitise(value); });
    if (!inputs.diet_type) inputs.diet_type = 'omnivore';
    return inputs;
  }

  function calculate() {
    const inputs = _readInputs();
    const result = EmissionEngine.calculate(inputs);
    window._ecoTraceResult = result; // expose for AI context injection
    ProgressTracker.save(result);
    ResultsRenderer.display(result);
  }

  function reset() {
    const form    = DOMCache.get('calcForm');
    const results = DOMCache.get('results');
    if (form)    { form.style.display = ''; form.reset(); }
    if (results) results.hidden = true;
    const localFoodVal = DOMCache.get('localFoodVal');
    if (localFoodVal) localFoodVal.textContent = '30%';
    _step = 1;
    DOMCache.get('step1')?.classList.add('active');
    for (let i = 2; i <= TOTAL_STEPS; i++) DOMCache.get(`step${i}`)?.classList.remove('active');
    _updateProgress(1);
  }

  return Object.freeze({ getStep, goToStep, calculate, reset });
})();

/* ═══════════════════════════════════════════════════════════════
   TIPS CONTROLLER
═══════════════════════════════════════════════════════════════ */

const TipsController = Object.freeze({
  filter(category, activeBtn) {
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-pressed', 'true');
    this.render(category);
  },

  render(category = 'all') {
    const grid = DOMCache.get('tipsGrid');
    if (!grid) return;

    const impactOrder = Object.freeze({ high: 0, medium: 1, low: 2 });
    const filtered    = (category === 'all' ? [...TIPS] : TIPS.filter(t => t.cat === category))
      .slice()
      .sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact] || b.saving - a.saving);

    const fragment = document.createDocumentFragment();
    filtered.forEach(tip => {
      const icon   = Utils.el('div', { className: 'tip-card__icon', attrs: { 'aria-hidden': 'true' }, text: tip.icon });
      const title  = Utils.el('h4', { text: tip.title });
      const desc   = Utils.el('p',  { text: tip.desc });
      const badge  = Utils.el('span', { className: `tip-card__impact impact--${tip.impact}`, text: `${tip.impact.toUpperCase()} IMPACT` });
      const saving = Utils.el('span', { className: 'tip-card__saving', text: `Saves ~${tip.saving}t CO₂/yr` });
      const meta   = Utils.el('div', { className: 'tip-card__meta', children: [badge, saving] });
      const body   = Utils.el('div', { className: 'tip-card__body', children: [title, desc, meta] });
      const card   = Utils.el('div', { className: 'tip-card', attrs: { role: 'listitem' }, children: [icon, body] });
      fragment.appendChild(card);
    });

    grid.textContent = ''; // safe clear — no innerHTML
    grid.appendChild(fragment);
  },
});

/* ═══════════════════════════════════════════════════════════════
   CHAT CONTROLLER
═══════════════════════════════════════════════════════════════ */

const ChatController = (() => {
  const MAX_HISTORY   = 20;
  const RATE_LIMIT_MS = 1500;
  const MAX_MSG_LEN   = 2000;

  const SYSTEM_PROMPT = `You are EcoTrace, a knowledgeable and friendly carbon footprint assistant.
Help users understand their environmental impact and give concrete, actionable advice.

Guidelines:
- Be conversational, clear, and encouraging — never preachy or alarmist
- Use specific statistics; cite IPCC, OurWorldInData, DEFRA by name where appropriate
- Tailor advice to be practical; acknowledge Indian context where relevant
- Keep responses to 3–5 sentences unless a longer answer genuinely helps
- Use at most one emoji per response
- Never lecture — offer alternatives, not judgements
- Reference the user's footprint data when it is available in context

Expertise: carbon footprints, climate science, renewable energy, sustainable transport, food emissions,
circular economy, Paris Agreement, scope 1/2/3 emissions, carbon offsets, climate policy.`;

  let _history   = [];
  let _waiting   = false;
  let _lastSent  = 0;

  function _buildSystemPrompt() {
    const r = window._ecoTraceResult;
    if (!r) return SYSTEM_PROMPT;
    const biggest = Object.entries({ home: r.home, travel: r.travel, food: r.food, shopping: r.shopping })
      .sort((a, b) => b[1] - a[1])[0][0];
    return `${SYSTEM_PROMPT}\n\nUser's footprint: ${r.total}t CO₂/yr (Home: ${r.home}t | Travel: ${r.travel}t | Food: ${r.food}t | Shopping: ${r.shopping}t). Biggest category: ${biggest}.`;
  }

  function _appendMessage(role, content) {
    const messages = DOMCache.get('chatMessages');
    if (!messages) return;

    if (role === 'user') messages.querySelector('.chat__suggestions')?.remove();

    const avatar = Utils.el('div', { className: 'chat__avatar', attrs: { 'aria-hidden': 'true' }, text: role === 'assistant' ? '◈' : '👤' });
    const bubble = Utils.el('div', { className: 'chat__bubble' });
    bubble.innerHTML = Utils.formatMessage(content); // safe: HTML-escaped first

    const msg = Utils.el('div', {
      className: `chat__message chat__message--${role === 'assistant' ? 'assistant' : 'user'}`,
      children: [avatar, bubble],
    });
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  function _showTyping() {
    const messages = DOMCache.get('chatMessages');
    if (!messages) return;
    const dots   = [Utils.el('span'), Utils.el('span'), Utils.el('span')];
    const ind    = Utils.el('div', { className: 'typing-indicator', attrs: { role: 'status', 'aria-label': 'Assistant is typing' }, children: dots });
    const bubble = Utils.el('div', { className: 'chat__bubble', children: [ind] });
    const avatar = Utils.el('div', { className: 'chat__avatar', attrs: { 'aria-hidden': 'true' }, text: '◈' });
    const msg    = Utils.el('div', { className: 'chat__message chat__message--assistant', attrs: { id: 'typingIndicator' }, children: [avatar, bubble] });
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
  }

  function _removeTyping() {
    document.getElementById('typingIndicator')?.remove();
  }

  async function send(text) {
    if (_waiting) return;
    const now = Date.now();
    if (now - _lastSent < RATE_LIMIT_MS) return;
    _lastSent = now;

    const clean = Utils.sanitise(text).slice(0, MAX_MSG_LEN);
    if (!clean) return;

    _appendMessage('user', clean);
    _history.push({ role: 'user', content: clean });
    if (_history.length > MAX_HISTORY) _history = _history.slice(-MAX_HISTORY);

    _waiting = true;
    const btn = DOMCache.get('chatSendBtn');
    if (btn) btn.disabled = true;
    _showTyping();

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model:     'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system:    _buildSystemPrompt(),
          messages:  _history,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message ?? `HTTP ${response.status}`);
      }

      const data  = await response.json();
      const reply = data.content?.find(b => b.type === 'text')?.text ?? 'No response received.';
      _removeTyping();
      _appendMessage('assistant', reply);
      _history.push({ role: 'assistant', content: reply });

    } catch (err) {
      _removeTyping();
      _appendMessage('assistant', 'I\'m having trouble connecting. Please try again in a moment.');
      console.error('[EcoTrace Chat]', err.message);
    } finally {
      _waiting = false;
      if (btn) btn.disabled = false;
      DOMCache.get('chatInput')?.focus();
    }
  }

  return Object.freeze({ send });
})();

/* ═══════════════════════════════════════════════════════════════
   HERO COUNTER ANIMATION
═══════════════════════════════════════════════════════════════ */

function _initCounters() {
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
   LAZY SECTION REVEAL
═══════════════════════════════════════════════════════════════ */

function _initLazySections() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('.section--lazy').forEach(el => el.classList.add('section--visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      target.classList.add('section--visible');
      observer.unobserve(target);
    });
  }, { rootMargin: '80px' });
  document.querySelectorAll('.section--lazy').forEach(el => observer.observe(el));
}

/* ═══════════════════════════════════════════════════════════════
   EVENT BINDING — all events registered here, zero inline handlers
═══════════════════════════════════════════════════════════════ */

function _bindEvents() {
  // Smooth scroll buttons (data-scroll-to="sectionId")
  document.querySelectorAll('[data-scroll-to]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.scrollTo)?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Calculator step navigation (data-go-step="N")
  document.querySelectorAll('[data-go-step]').forEach(btn => {
    btn.addEventListener('click', () => Calculator.goToStep(parseInt(btn.dataset.goStep, 10)));
  });

  // Calculate submit
  DOMCache.get('calcSubmitBtn')?.addEventListener('click', () => Calculator.calculate());

  // Recalculate
  DOMCache.get('recalcBtn')?.addEventListener('click', () => Calculator.reset());

  // Tips filter buttons (data-filter="category")
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => TipsController.filter(btn.dataset.filter, btn));
  });

  // Range slider → output
  const localFood = document.getElementById('local_food');
  const localVal  = DOMCache.get('localFoodVal');
  if (localFood && localVal) {
    localFood.addEventListener('input', () => {
      localVal.textContent = `${localFood.value}%`;
      localFood.setAttribute('aria-valuenow', localFood.value);
    });
  }

  // Chat send button
  DOMCache.get('chatSendBtn')?.addEventListener('click', _sendChatMessage);

  // Chat textarea — Enter to send, Shift+Enter for newline, auto-resize
  const chatInput = DOMCache.get('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _sendChatMessage();
      }
    });
    chatInput.addEventListener('input', Utils.debounce(() => {
      chatInput.style.height = 'auto';
      chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
    }, 50));
  }

  // Suggestion buttons (data-suggestion="text")
  document.querySelectorAll('.suggestion-btn[data-suggestion]').forEach(btn => {
    btn.addEventListener('click', () => {
      const chatInput = DOMCache.get('chatInput');
      if (chatInput) { chatInput.value = btn.dataset.suggestion; }
      _sendChatMessage();
    });
  });
}

function _sendChatMessage() {
  const input = DOMCache.get('chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  ChatController.send(text);
}

/* ═══════════════════════════════════════════════════════════════
   SERVICE WORKER REGISTRATION
═══════════════════════════════════════════════════════════════ */

function _registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .catch(() => { /* SW unavailable (file://, older browsers) */ });
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  _bindEvents();
  _initCounters();
  _initLazySections();
  TipsController.render();
  _registerServiceWorker();

  window._ecoTraceResult = null;
});
