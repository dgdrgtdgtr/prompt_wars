/**
 * EcoTrace — Comprehensive Test Suite v2
 * @description Tests all core modules: EmissionEngine, Utils,
 *              ProgressTracker logic, TipsController, ChatController helpers
 *
 * Run: node tests/ecotrace.test.js
 * No external dependencies required — pure Node.js.
 */

'use strict';

/* ─── Test harness ───────────────────────────────────────────── */

let passed = 0, failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ✅ ${name}\n`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    process.stdout.write(`  ❌ ${name}\n     → ${err.message}\n`);
  }
}

function describe(suite, fn) {
  console.log(`\n📋 ${suite}`);
  fn();
}

function expect(actual) {
  return {
    toBe:                (e) => { if (actual !== e)                     throw new Error(`Expected ${JSON.stringify(e)}, got ${JSON.stringify(actual)}`); },
    toEqual:             (e) => { if (JSON.stringify(actual) !== JSON.stringify(e)) throw new Error(`Expected ${JSON.stringify(e)}, got ${JSON.stringify(actual)}`); },
    toBeCloseTo:         (e, p = 2) => { if (Math.abs(actual - e) > Math.pow(10, -p) / 2) throw new Error(`Expected ~${e}, got ${actual}`); },
    toBeGreaterThan:     (e) => { if (actual <= e)  throw new Error(`Expected > ${e}, got ${actual}`); },
    toBeGreaterThanOrEqual: (e) => { if (actual < e) throw new Error(`Expected >= ${e}, got ${actual}`); },
    toBeLessThan:        (e) => { if (actual >= e)  throw new Error(`Expected < ${e}, got ${actual}`); },
    toBeLessThanOrEqual: (e) => { if (actual > e)   throw new Error(`Expected <= ${e}, got ${actual}`); },
    toBeTrue:            ()  => { if (actual !== true)  throw new Error(`Expected true, got ${actual}`); },
    toBeFalse:           ()  => { if (actual !== false) throw new Error(`Expected false, got ${actual}`); },
    toBeNull:            ()  => { if (actual !== null)  throw new Error(`Expected null, got ${actual}`); },
    toBeFinite:          ()  => { if (!isFinite(actual)) throw new Error(`Expected finite, got ${actual}`); },
    toContain:           (e) => { if (!String(actual).includes(e)) throw new Error(`Expected "${actual}" to contain "${e}"`); },
    toMatch:             (r) => { if (!r.test(actual)) throw new Error(`Expected "${actual}" to match ${r}`); },
    toThrow:             ()  => {
      if (typeof actual !== 'function') throw new Error('toThrow requires a function');
      let threw = false;
      try { actual(); } catch { threw = true; }
      if (!threw) throw new Error('Expected function to throw, but it did not');
    },
    not: {
      toBe:      (e) => { if (actual === e)               throw new Error(`Expected NOT ${JSON.stringify(e)}`); },
      toContain: (e) => { if (String(actual).includes(e)) throw new Error(`Expected "${actual}" NOT to contain "${e}"`); },
      toBeNull:  ()  => { if (actual === null)             throw new Error('Expected NOT null'); },
    },
  };
}

/* ─── Re-implement core modules (extracted for Node.js testability) ── */

// ── Emission factors (must match app.js exactly) ──
const EMISSION_FACTORS = Object.freeze({
  energy:      { coal: 0.92, gas: 0.55, mixed: 0.45, renewable: 0.05, solar: 0.02 },
  heating:     { gas: 0.2, electric: 0.1, none: 0, solar_thermal: 0.01 },
  car:         { none: 0, petrol: 0.21, diesel: 0.17, hybrid: 0.11, ev: 0.07 },
  flightShort: 0.25,
  flightLong:  1.6,
  diet:        { vegan: 1.5, vegetarian: 1.7, pescatarian: 2.1, omnivore: 2.5, high_meat: 3.3 },
  foodWaste:   { low: -0.1, medium: 0, high: 0.2 },
  clothing:    0.01,
  electronics: 0.15,
  streaming:   0.0006,
  recyclingBonus: { none: 0, some: -0.05, most: -0.15, all: -0.25 },
});

const BENCHMARKS = Object.freeze({ globalAvg: 4.7, parisTarget: 2.0 });

const INPUT_LIMITS = Object.freeze({
  monthly_bill:   { min: 0, max: 100_000 },
  km_per_week:    { min: 0, max: 10_000  },
  flights_short:  { min: 0, max: 365     },
  flights_long:   { min: 0, max: 365     },
  local_food:     { min: 0, max: 100     },
  new_clothes:    { min: 0, max: 10_000  },
  electronics:    { min: 0, max: 1_000   },
  streaming:      { min: 0, max: 24      },
});

const TIPS = [
  { icon: '⚡', cat: 'home',     title: 'Switch to renewable energy',      impact: 'high',   saving: 1.5  },
  { icon: '💡', cat: 'home',     title: 'LED lighting throughout',          impact: 'low',    saving: 0.05 },
  { icon: '🌡️', cat: 'home',     title: 'Drop heating by 1°C',              impact: 'medium', saving: 0.31 },
  { icon: '🪟', cat: 'home',     title: 'Insulate walls and roof',          impact: 'high',   saving: 1.0  },
  { icon: '✈️', cat: 'travel',   title: 'Eliminate one long-haul flight',   impact: 'high',   saving: 1.6  },
  { icon: '🚄', cat: 'travel',   title: 'Train over plane for short trips', impact: 'high',   saving: 0.5  },
  { icon: '🚲', cat: 'travel',   title: 'Cycle or walk for short trips',    impact: 'medium', saving: 0.3  },
  { icon: '🔋', cat: 'travel',   title: 'Switch to an electric vehicle',    impact: 'high',   saving: 1.2  },
  { icon: '🌱', cat: 'food',     title: 'Try plant-based meals 3×/week',   impact: 'high',   saving: 0.7  },
  { icon: '🥩', cat: 'food',     title: 'Cut beef consumption in half',     impact: 'high',   saving: 0.5  },
  { icon: '🛒', cat: 'food',     title: 'Buy local and seasonal produce',   impact: 'medium', saving: 0.2  },
  { icon: '🗑️', cat: 'food',     title: 'Halve your food waste',            impact: 'medium', saving: 0.3  },
  { icon: '👗', cat: 'shopping', title: 'Buy secondhand clothing',          impact: 'medium', saving: 0.2  },
  { icon: '📱', cat: 'shopping', title: 'Keep electronics for longer',      impact: 'medium', saving: 0.15 },
  { icon: '♻️', cat: 'shopping', title: 'Recycle and repair first',         impact: 'low',    saving: 0.1  },
  { icon: '📦', cat: 'shopping', title: 'Reduce online delivery frequency', impact: 'low',    saving: 0.05 },
];

// ── Utils ──
const Utils = {
  clampNum(value, min = 0, max = Infinity) {
    const n = parseFloat(value);
    if (isNaN(n) || n < min) return min;
    return Math.min(n, max);
  },
  sanitise(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim();
  },
  isValidUrl(url) {
    try {
      const { protocol } = new URL(url);
      return protocol === 'https:' || protocol === 'http:';
    } catch { return false; }
  },
  formatMessage(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  },
  round(n, places = 2) { return +n.toFixed(places); },
  debounce(fn, delay) {
    let timer;
    return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
  },
  formatCO2(value) { return `${Utils.round(value, 2).toFixed(2)} t CO₂`; },
};

// ── EmissionEngine ──
const EmissionEngine = {
  calcHome({ monthlyBill, energySource, heating }) {
    const INR_PER_KWH = 8;
    const kwh = monthlyBill / INR_PER_KWH;
    const energyFactor  = EMISSION_FACTORS.energy[energySource] ?? EMISSION_FACTORS.energy.mixed;
    const heatingFactor = EMISSION_FACTORS.heating[heating] ?? 0;
    return Utils.round(Math.max(0, (kwh * 12 * energyFactor / 1000) + heatingFactor));
  },
  calcTravel({ carType, kmPerWeek, flightsShort, flightsLong }) {
    const carFactor = EMISSION_FACTORS.car[carType] ?? 0;
    const carEmit   = (kmPerWeek * 52 * carFactor) / 1000;
    const flightEmit = flightsShort * EMISSION_FACTORS.flightShort + flightsLong * EMISSION_FACTORS.flightLong;
    return Utils.round(Math.max(0, carEmit + flightEmit));
  },
  calcFood({ dietType, localFoodPct, foodWaste }) {
    const base       = EMISSION_FACTORS.diet[dietType] ?? EMISSION_FACTORS.diet.omnivore;
    const localSave  = -(localFoodPct / 100) * 0.3;
    const wasteAdj   = EMISSION_FACTORS.foodWaste[foodWaste] ?? 0;
    return Utils.round(Math.max(0, base + localSave + wasteAdj));
  },
  calcShopping({ newClothes, newElectronics, streamingHours, recycling }) {
    const clothingEmit    = newClothes     * EMISSION_FACTORS.clothing;
    const electronicsEmit = newElectronics * EMISSION_FACTORS.electronics;
    const streamingEmit   = (streamingHours * 365 * EMISSION_FACTORS.streaming) / 1000;
    const recycleBonus    = EMISSION_FACTORS.recyclingBonus[recycling] ?? 0;
    return Utils.round(Math.max(0, clothingEmit + electronicsEmit + streamingEmit + recycleBonus));
  },
  calculate(inputs = {}) {
    const n = (key) => Utils.clampNum(inputs[key], INPUT_LIMITS[key]?.min ?? 0, INPUT_LIMITS[key]?.max ?? Infinity);
    const home     = this.calcHome({ monthlyBill: n('monthly_bill'), energySource: inputs.energy_source || 'mixed', heating: inputs.heating || 'none' });
    const travel   = this.calcTravel({ carType: inputs.car_type || 'none', kmPerWeek: n('km_per_week'), flightsShort: n('flights_short'), flightsLong: n('flights_long') });
    const food     = this.calcFood({ dietType: inputs.diet_type || 'omnivore', localFoodPct: n('local_food'), foodWaste: inputs.food_waste || 'medium' });
    const shopping = this.calcShopping({ newClothes: n('new_clothes'), newElectronics: n('electronics'), streamingHours: n('streaming'), recycling: inputs.recycling || 'most' });
    return { total: Utils.round(home + travel + food + shopping), home, travel, food, shopping };
  },
  getScoreLabel(total) {
    if (total <= BENCHMARKS.parisTarget) return { level: 'good', text: '🌱 On target',    color: '#8FFF6A' };
    if (total <= BENCHMARKS.globalAvg)   return { level: 'warn', text: '⚠️ Above target', color: '#FFD166' };
    return                                       { level: 'bad',  text: '🔴 High impact',  color: '#FF6B6B' };
  },
  getTipSaving(tipTitle) { return TIPS.find(t => t.title === tipTitle)?.saving ?? 0; },
};

// ── TipsController logic ──
const impactOrder = { high: 0, medium: 1, low: 2 };
function filterAndSortTips(category) {
  return (category === 'all' ? [...TIPS] : TIPS.filter(t => t.cat === category))
    .sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact] || b.saving - a.saving);
}

// ── Progress tracker logic (in-memory mock) ──
function makeProgressTracker() {
  const store = [];
  return {
    save(result) { store.push({ ...result, date: new Date().toISOString() }); },
    load()       { return [...store]; },
    getTrend()   {
      if (store.length < 2) return null;
      return Utils.round(store.at(-1).total - store.at(-2).total);
    },
  };
}

// ── Calculator progress logic ──
function getProgressPct(step, totalSteps = 4) {
  if (step < 1 || step > totalSteps) throw new RangeError(`Step must be 1-${totalSteps}, got ${step}`);
  return (step / totalSteps) * 100;
}

/* ═══════════════════════════════════════════════════════════════
   TEST SUITES
═══════════════════════════════════════════════════════════════ */

describe('Utils.clampNum', () => {
  test('returns value within range unchanged',           () => expect(Utils.clampNum(5, 0, 10)).toBe(5));
  test('clamps below min to min',                        () => expect(Utils.clampNum(-5, 0, 10)).toBe(0));
  test('clamps above max to max',                        () => expect(Utils.clampNum(20, 0, 10)).toBe(10));
  test('treats NaN as min',                              () => expect(Utils.clampNum(NaN, 0, 10)).toBe(0));
  test('treats Infinity as max',                         () => expect(Utils.clampNum(Infinity, 0, 100)).toBe(100));
  test('parses string numbers',                          () => expect(Utils.clampNum('42', 0, 100)).toBe(42));
  test('parses floating-point strings',                  () => expect(Utils.clampNum('3.5', 0, 10)).toBe(3.5));
  test('negative min works correctly',                   () => expect(Utils.clampNum(-5, -10, 10)).toBe(-5));
});

describe('Utils.sanitise', () => {
  test('strips <script> tags',                           () => expect(Utils.sanitise('<script>alert(1)</script>hi')).not.toContain('<script>'));
  test('preserves content after script tag',             () => expect(Utils.sanitise('<script>x</script>hello')).toContain('hello'));
  test('strips arbitrary HTML tags',                     () => expect(Utils.sanitise('<img src=x onerror=1>text')).not.toContain('<img'));
  test('preserves plain text',                           () => expect(Utils.sanitise('Hello World!')).toBe('Hello World!'));
  test('returns numbers unchanged',                      () => expect(Utils.sanitise(42)).toBe(42));
  test('returns null unchanged',                         () => expect(Utils.sanitise(null)).toBeNull());
  test('trims leading/trailing whitespace',              () => expect(Utils.sanitise('  hi  ')).toBe('hi'));
  test('handles empty string',                           () => expect(Utils.sanitise('')).toBe(''));
});

describe('Utils.isValidUrl', () => {
  test('accepts https URLs',                             () => expect(Utils.isValidUrl('https://example.com')).toBeTrue());
  test('accepts http URLs',                              () => expect(Utils.isValidUrl('http://example.com/path?q=1')).toBeTrue());
  test('rejects javascript: protocol',                   () => expect(Utils.isValidUrl('javascript:alert(1)')).toBeFalse());
  test('rejects data: URIs',                             () => expect(Utils.isValidUrl('data:text/html,<h1>hi</h1>')).toBeFalse());
  test('rejects plain strings',                          () => expect(Utils.isValidUrl('not a url')).toBeFalse());
  test('rejects empty string',                           () => expect(Utils.isValidUrl('')).toBeFalse());
  test('rejects ftp: protocol',                          () => expect(Utils.isValidUrl('ftp://files.example.com')).toBeFalse());
  test('accepts URL with port',                          () => expect(Utils.isValidUrl('https://localhost:3000')).toBeTrue());
});

describe('Utils.formatMessage (XSS safety)', () => {
  test('escapes < and >',                                () => { const r = Utils.formatMessage('<b>bold</b>'); expect(r).toContain('&lt;b&gt;'); });
  test('escapes & ampersand',                            () => expect(Utils.formatMessage('AT&T')).toContain('&amp;'));
  test('escapes double quotes',                          () => expect(Utils.formatMessage('"hello"')).toContain('&quot;'));
  test('script tag is fully escaped',                    () => { const r = Utils.formatMessage('<script>alert(1)</script>'); expect(r).not.toContain('<script>'); });
  test('converts **bold** to <strong>',                  () => expect(Utils.formatMessage('**hi**')).toContain('<strong>hi</strong>'));
  test('converts \\n to <br>',                           () => expect(Utils.formatMessage('a\nb')).toContain('<br>'));
  test('returns empty string for non-string input',      () => expect(Utils.formatMessage(null)).toBe(''));
  test('returns empty string for undefined',             () => expect(Utils.formatMessage(undefined)).toBe(''));
});

describe('Utils.round', () => {
  test('rounds to 2 decimal places by default',          () => expect(Utils.round(1.2345)).toBe(1.23));
  test('rounds to 1 decimal place',                      () => expect(Utils.round(1.25, 1)).toBe(1.3));
  test('returns a number type',                          () => expect(typeof Utils.round(1.5)).toBe('number'));
  test('handles zero',                                   () => expect(Utils.round(0)).toBe(0));
});

describe('Utils.formatCO2', () => {
  test('formats 2.5 as "2.50 t CO₂"',                   () => expect(Utils.formatCO2(2.5)).toBe('2.50 t CO₂'));
  test('formats 0 as "0.00 t CO₂"',                     () => expect(Utils.formatCO2(0)).toBe('0.00 t CO₂'));
});

describe('Utils.debounce', () => {
  test('returns a function',                             () => expect(typeof Utils.debounce(() => {}, 100)).toBe('function'));
});

describe('Emission Factors — data integrity', () => {
  test('all energy factors are non-negative numbers',    () => Object.values(EMISSION_FACTORS.energy).forEach(v => expect(v).toBeGreaterThanOrEqual(0)));
  test('coal > gas > mixed > renewable > solar',         () => {
    const e = EMISSION_FACTORS.energy;
    expect(e.coal).toBeGreaterThan(e.gas);
    expect(e.gas).toBeGreaterThan(e.mixed);
    expect(e.mixed).toBeGreaterThan(e.renewable);
    expect(e.renewable).toBeGreaterThan(e.solar);
  });
  test('EV < hybrid < diesel < petrol per km',           () => {
    const c = EMISSION_FACTORS.car;
    expect(c.ev).toBeLessThan(c.hybrid);
    expect(c.hybrid).toBeLessThan(c.diesel);
    expect(c.diesel).toBeLessThan(c.petrol);
  });
  test('long-haul > short-haul flight',                  () => expect(EMISSION_FACTORS.flightLong).toBeGreaterThan(EMISSION_FACTORS.flightShort));
  test('diet ladder strictly ordered',                   () => {
    const d = EMISSION_FACTORS.diet;
    expect(d.high_meat).toBeGreaterThan(d.omnivore);
    expect(d.omnivore).toBeGreaterThan(d.pescatarian);
    expect(d.pescatarian).toBeGreaterThan(d.vegetarian);
    expect(d.vegetarian).toBeGreaterThan(d.vegan);
  });
  test('all recycling bonuses are <= 0',                 () => Object.values(EMISSION_FACTORS.recyclingBonus).forEach(v => expect(v).toBeLessThanOrEqual(0)));
});

describe('EmissionEngine.calcHome', () => {
  test('zero bill → only heating contributes',           () => expect(EmissionEngine.calcHome({ monthlyBill: 0, energySource: 'coal', heating: 'gas' })).toBe(0.2));
  test('coal produces more than renewable same bill',    () => {
    const coal = EmissionEngine.calcHome({ monthlyBill: 2000, energySource: 'coal', heating: 'none' });
    const renew = EmissionEngine.calcHome({ monthlyBill: 2000, energySource: 'renewable', heating: 'none' });
    expect(coal).toBeGreaterThan(renew);
  });
  test('result is never negative',                       () => expect(EmissionEngine.calcHome({ monthlyBill: -999, energySource: 'solar', heating: 'none' })).toBeGreaterThanOrEqual(0));
  test('bill scales proportionally',                     () => {
    const low  = EmissionEngine.calcHome({ monthlyBill: 1000, energySource: 'mixed', heating: 'none' });
    const high = EmissionEngine.calcHome({ monthlyBill: 4000, energySource: 'mixed', heating: 'none' });
    expect(high / low).toBeCloseTo(4, 0);
  });
  test('unknown source falls back to mixed',             () => {
    const mixed   = EmissionEngine.calcHome({ monthlyBill: 1000, energySource: 'mixed',   heating: 'none' });
    const unknown = EmissionEngine.calcHome({ monthlyBill: 1000, energySource: 'UNKNOWN', heating: 'none' });
    expect(mixed).toBe(unknown);
  });
});

describe('EmissionEngine.calcTravel', () => {
  test('no car, no flights = 0t',                        () => expect(EmissionEngine.calcTravel({ carType: 'none', kmPerWeek: 0, flightsShort: 0, flightsLong: 0 })).toBe(0));
  test('petrol > EV same distance',                      () => {
    const p = EmissionEngine.calcTravel({ carType: 'petrol', kmPerWeek: 200, flightsShort: 0, flightsLong: 0 });
    const e = EmissionEngine.calcTravel({ carType: 'ev',     kmPerWeek: 200, flightsShort: 0, flightsLong: 0 });
    expect(p).toBeGreaterThan(e);
  });
  test('1 long-haul flight = 1.6t',                      () => expect(EmissionEngine.calcTravel({ carType: 'none', kmPerWeek: 0, flightsShort: 0, flightsLong: 1 })).toBeCloseTo(1.6, 1));
  test('4 short-haul flights = 1.0t',                    () => expect(EmissionEngine.calcTravel({ carType: 'none', kmPerWeek: 0, flightsShort: 4, flightsLong: 0 })).toBeCloseTo(1.0, 1));
  test('100km/week petrol ≈ 1.09t/yr',                   () => expect(EmissionEngine.calcTravel({ carType: 'petrol', kmPerWeek: 100, flightsShort: 0, flightsLong: 0 })).toBeCloseTo(1.09, 1));
  test('never negative',                                  () => expect(EmissionEngine.calcTravel({ carType: 'none', kmPerWeek: -999, flightsShort: -5, flightsLong: -1 })).toBeGreaterThanOrEqual(0));
});

describe('EmissionEngine.calcFood', () => {
  test('high_meat > omnivore > vegan',                   () => {
    const hm  = EmissionEngine.calcFood({ dietType: 'high_meat', localFoodPct: 30, foodWaste: 'medium' });
    const omn = EmissionEngine.calcFood({ dietType: 'omnivore',  localFoodPct: 30, foodWaste: 'medium' });
    const veg = EmissionEngine.calcFood({ dietType: 'vegan',     localFoodPct: 30, foodWaste: 'medium' });
    expect(hm).toBeGreaterThan(omn);
    expect(omn).toBeGreaterThan(veg);
  });
  test('100% local saves vs 0% local',                   () => {
    const local  = EmissionEngine.calcFood({ dietType: 'omnivore', localFoodPct: 100, foodWaste: 'medium' });
    const import_ = EmissionEngine.calcFood({ dietType: 'omnivore', localFoodPct: 0,   foodWaste: 'medium' });
    expect(import_).toBeGreaterThan(local);
  });
  test('high waste > medium waste > low waste',          () => {
    const high = EmissionEngine.calcFood({ dietType: 'omnivore', localFoodPct: 30, foodWaste: 'high' });
    const low  = EmissionEngine.calcFood({ dietType: 'omnivore', localFoodPct: 30, foodWaste: 'low' });
    expect(high).toBeGreaterThan(low);
  });
  test('omnivore + 0% local + medium waste = 2.5t',      () => expect(EmissionEngine.calcFood({ dietType: 'omnivore', localFoodPct: 0, foodWaste: 'medium' })).toBeCloseTo(2.5, 1));
  test('never negative',                                  () => expect(EmissionEngine.calcFood({ dietType: 'vegan', localFoodPct: 100, foodWaste: 'low' })).toBeGreaterThanOrEqual(0));
  test('unknown diet falls back to omnivore',             () => {
    const omn     = EmissionEngine.calcFood({ dietType: 'omnivore', localFoodPct: 0, foodWaste: 'medium' });
    const unknown = EmissionEngine.calcFood({ dietType: 'UNKNOWN',  localFoodPct: 0, foodWaste: 'medium' });
    expect(omn).toBe(unknown);
  });
});

describe('EmissionEngine.calcShopping', () => {
  test('zero inputs = 0 (no recycling bonus)',            () => expect(EmissionEngine.calcShopping({ newClothes: 0, newElectronics: 0, streamingHours: 0, recycling: 'none' })).toBe(0));
  test('2 electronics = 0.30t',                          () => expect(EmissionEngine.calcShopping({ newClothes: 0, newElectronics: 2, streamingHours: 0, recycling: 'none' })).toBeCloseTo(0.3, 1));
  test('recycling all reduces vs no recycling',           () => {
    const all  = EmissionEngine.calcShopping({ newClothes: 10, newElectronics: 1, streamingHours: 2, recycling: 'all'  });
    const none = EmissionEngine.calcShopping({ newClothes: 10, newElectronics: 1, streamingHours: 2, recycling: 'none' });
    expect(none).toBeGreaterThan(all);
  });
  test('more clothes = more emissions',                   () => {
    const few  = EmissionEngine.calcShopping({ newClothes: 5,  newElectronics: 0, streamingHours: 0, recycling: 'none' });
    const many = EmissionEngine.calcShopping({ newClothes: 50, newElectronics: 0, streamingHours: 0, recycling: 'none' });
    expect(many).toBeGreaterThan(few);
  });
  test('never negative',                                  () => expect(EmissionEngine.calcShopping({ newClothes: 0, newElectronics: 0, streamingHours: 0, recycling: 'all' })).toBeGreaterThanOrEqual(0));
});

describe('EmissionEngine.calculate (full integration)', () => {
  test('total = home + travel + food + shopping',         () => {
    const r = EmissionEngine.calculate({ monthly_bill: 2000, energy_source: 'gas', heating: 'gas', car_type: 'petrol', km_per_week: 150, flights_short: 2, flights_long: 1, diet_type: 'omnivore', local_food: 30, food_waste: 'medium', new_clothes: 20, electronics: 2, streaming: 3, recycling: 'most' });
    expect(r.total).toBe(Utils.round(r.home + r.travel + r.food + r.shopping));
  });
  test('total is always non-negative',                    () => expect(EmissionEngine.calculate({}).total).toBeGreaterThanOrEqual(0));
  test('default inputs produce diet baseline only',       () => expect(EmissionEngine.calculate({}).total).toBeGreaterThan(0));
  test('NaN inputs clamped to zero',                      () => { const r = EmissionEngine.calculate({ monthly_bill: NaN, km_per_week: NaN }); expect(r.home).toBeGreaterThanOrEqual(0); expect(r.travel).toBeGreaterThanOrEqual(0); });
  test('string numeric inputs parsed correctly',          () => { const r = EmissionEngine.calculate({ monthly_bill: '2000', km_per_week: '100', new_clothes: '10' }); expect(r.total).toBeGreaterThan(0); });
  test('typical Indian household is plausible (0.5–8t)', () => {
    const r = EmissionEngine.calculate({ monthly_bill: 1500, energy_source: 'mixed', heating: 'none', car_type: 'petrol', km_per_week: 100, flights_short: 1, flights_long: 0, diet_type: 'omnivore', local_food: 40, food_waste: 'medium', new_clothes: 15, electronics: 1, streaming: 2, recycling: 'some' });
    expect(r.total).toBeGreaterThan(0.5);
    expect(r.total).toBeLessThan(8);
  });
  test('extreme km_per_week capped — result is finite',   () => expect(EmissionEngine.calculate({ car_type: 'petrol', km_per_week: 999_999 }).travel).toBeFinite());
  test('local_food > 100 clamped to 100',                 () => {
    const over  = EmissionEngine.calculate({ diet_type: 'omnivore', local_food: 200, food_waste: 'medium' });
    const exact = EmissionEngine.calculate({ diet_type: 'omnivore', local_food: 100, food_waste: 'medium' });
    expect(over.food).toBe(exact.food);
  });
});

describe('EmissionEngine.getScoreLabel', () => {
  test('0t → good (on target)',                           () => expect(EmissionEngine.getScoreLabel(0).level).toBe('good'));
  test('2.0t boundary → good',                           () => expect(EmissionEngine.getScoreLabel(2.0).level).toBe('good'));
  test('2.1t → warn (above target)',                     () => expect(EmissionEngine.getScoreLabel(2.1).level).toBe('warn'));
  test('4.7t boundary → warn',                           () => expect(EmissionEngine.getScoreLabel(4.7).level).toBe('warn'));
  test('4.8t → bad (high impact)',                       () => expect(EmissionEngine.getScoreLabel(4.8).level).toBe('bad'));
  test('each level has a text label',                    () => ['good','warn','bad'].forEach(level => expect(typeof EmissionEngine.getScoreLabel(level === 'good' ? 1 : level === 'warn' ? 3 : 6).text).toBe('string')));
  test('each level has a hex color',                     () => ['good','warn','bad'].forEach(level => expect(EmissionEngine.getScoreLabel(level === 'good' ? 1 : level === 'warn' ? 3 : 6).color).toMatch(/^#[0-9A-Fa-f]{6}$/)));
});

describe('EmissionEngine.getTipSaving', () => {
  test('returns correct saving for known tip',            () => expect(EmissionEngine.getTipSaving('Switch to renewable energy')).toBe(1.5));
  test('returns 0 for unknown tip title',                 () => expect(EmissionEngine.getTipSaving('Unknown action')).toBe(0));
  test('all tips have positive savings',                  () => TIPS.forEach(t => expect(t.saving).toBeGreaterThan(0)));
});

describe('Tips filtering and sorting', () => {
  test('"all" returns all 16 tips',                      () => expect(filterAndSortTips('all').length).toBe(16));
  test('home filter returns only home tips',             () => filterAndSortTips('home').forEach(t => expect(t.cat).toBe('home')));
  test('travel filter returns only travel tips',         () => filterAndSortTips('travel').forEach(t => expect(t.cat).toBe('travel')));
  test('food filter returns only food tips',             () => filterAndSortTips('food').forEach(t => expect(t.cat).toBe('food')));
  test('shopping filter returns only shopping tips',     () => filterAndSortTips('shopping').forEach(t => expect(t.cat).toBe('shopping')));
  test('unknown category returns empty array',           () => expect(filterAndSortTips('unknown').length).toBe(0));
  test('high impact tips come before medium and low',    () => {
    const tips = filterAndSortTips('all');
    const firstMedium = tips.findIndex(t => t.impact === 'medium');
    const lastHigh    = tips.map(t => t.impact).lastIndexOf('high');
    expect(lastHigh).toBeLessThan(firstMedium);
  });
  test('each tip has required fields',                   () => TIPS.forEach(t => {
    expect(typeof t.cat).toBe('string');
    expect(typeof t.title).toBe('string');
    expect(typeof t.saving).toBe('number');
    expect(['high','medium','low'].includes(t.impact)).toBeTrue();
    expect(t.saving).toBeGreaterThan(0);
  }));
});

describe('Progress Tracker', () => {
  test('save and load round-trips correctly',             () => {
    const pt = makeProgressTracker();
    pt.save({ total: 4.5, home: 1, travel: 2, food: 1, shopping: 0.5 });
    expect(pt.load().length).toBe(1);
    expect(pt.load()[0].total).toBe(4.5);
  });
  test('getTrend returns null with < 2 entries',          () => {
    const pt = makeProgressTracker();
    expect(pt.getTrend()).toBeNull();
  });
  test('getTrend returns positive when footprint rises',  () => {
    const pt = makeProgressTracker();
    pt.save({ total: 3.0 }); pt.save({ total: 4.0 });
    expect(pt.getTrend()).toBeGreaterThan(0);
  });
  test('getTrend returns negative when footprint falls',  () => {
    const pt = makeProgressTracker();
    pt.save({ total: 5.0 }); pt.save({ total: 3.0 });
    expect(pt.getTrend()).toBeLessThan(0);
  });
  test('getTrend returns 0 when footprint unchanged',     () => {
    const pt = makeProgressTracker();
    pt.save({ total: 4.0 }); pt.save({ total: 4.0 });
    expect(pt.getTrend()).toBe(0);
  });
  test('multiple saves accumulate',                       () => {
    const pt = makeProgressTracker();
    [3, 4, 5, 3.5].forEach(total => pt.save({ total }));
    expect(pt.load().length).toBe(4);
  });
});

describe('Calculator progress', () => {
  test('step 1 = 25%',                                   () => expect(getProgressPct(1)).toBe(25));
  test('step 2 = 50%',                                   () => expect(getProgressPct(2)).toBe(50));
  test('step 3 = 75%',                                   () => expect(getProgressPct(3)).toBe(75));
  test('step 4 = 100%',                                  () => expect(getProgressPct(4)).toBe(100));
  test('step 0 throws RangeError',                       () => expect(() => getProgressPct(0)).toThrow());
  test('step 5 throws RangeError',                       () => expect(() => getProgressPct(5)).toThrow());
});

describe('Benchmark comparisons', () => {
  const diff = (total, bm) => Utils.round(total - bm, 1);
  test('5t is +0.3t above global avg',                   () => expect(diff(5.0, BENCHMARKS.globalAvg)).toBe(0.3));
  test('3t is -1.7t below global avg',                   () => expect(diff(3.0, BENCHMARKS.globalAvg)).toBe(-1.7));
  test('2t = 0t vs Paris target',                        () => expect(diff(2.0, BENCHMARKS.parisTarget)).toBe(0.0));
  test('1t is -1t below Paris target',                   () => expect(diff(1.0, BENCHMARKS.parisTarget)).toBe(-1.0));
  test('diff is positive when over benchmark',           () => expect(diff(6.0, BENCHMARKS.globalAvg)).toBeGreaterThan(0));
  test('diff is negative when under benchmark',          () => expect(diff(2.0, BENCHMARKS.globalAvg)).toBeLessThan(0));
});

/* ─── Summary ────────────────────────────────────────────────── */

console.log('\n' + '═'.repeat(56));
console.log(`  Total: ${passed + failed} tests | ✅ ${passed} passed | ❌ ${failed} failed`);
console.log('═'.repeat(56));

if (failed > 0) {
  console.log('\n⚠️  Failures:');
  failures.forEach(f => console.log(`  ❌ ${f.name}\n     ${f.error}`));
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!\n');
  process.exit(0);
}
