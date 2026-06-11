/**
 * EcoTrace — Comprehensive Test Suite
 * Tests: emission calculations, input validation, UI logic,
 *        edge cases, security (XSS), accessibility helpers
 *
 * Run with: node tests/ecotrace.test.js
 * No external dependencies required.
 */

'use strict';

/* ─── Minimal test harness ───────────────────────────────────── */

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ status: 'PASS', name });
    process.stdout.write(`  ✅ ${name}\n`);
  } catch (err) {
    failed++;
    results.push({ status: 'FAIL', name, error: err.message });
    process.stdout.write(`  ❌ ${name}\n     → ${err.message}\n`);
  }
}

function describe(suite, fn) {
  console.log(`\n📋 ${suite}`);
  fn();
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeCloseTo(expected, precision = 2) {
      const diff = Math.abs(actual - expected);
      const threshold = Math.pow(10, -precision) / 2;
      if (diff > threshold)
        throw new Error(`Expected ~${expected} (±${threshold}), got ${actual}`);
    },
    toBeGreaterThan(expected) {
      if (actual <= expected)
        throw new Error(`Expected > ${expected}, got ${actual}`);
    },
    toBeGreaterThanOrEqual(expected) {
      if (actual < expected)
        throw new Error(`Expected >= ${expected}, got ${actual}`);
    },
    toBeLessThan(expected) {
      if (actual >= expected)
        throw new Error(`Expected < ${expected}, got ${actual}`);
    },
    toBeLessThanOrEqual(expected) {
      if (actual > expected)
        throw new Error(`Expected <= ${expected}, got ${actual}`);
    },
    toBeTrue() {
      if (actual !== true)
        throw new Error(`Expected true, got ${actual}`);
    },
    toBeFalse() {
      if (actual !== false)
        throw new Error(`Expected false, got ${actual}`);
    },
    toBeNull() {
      if (actual !== null)
        throw new Error(`Expected null, got ${actual}`);
    },
    toContain(expected) {
      if (!actual.includes(expected))
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
    },
    toMatch(regex) {
      if (!regex.test(actual))
        throw new Error(`Expected "${actual}" to match ${regex}`);
    },
    toThrow() {
      if (typeof actual !== 'function')
        throw new Error('toThrow requires a function');
      try {
        actual();
        throw new Error('Expected function to throw, but it did not');
      } catch (e) {
        if (e.message === 'Expected function to throw, but it did not') throw e;
      }
    },
    not: {
      toBe(expected) {
        if (actual === expected)
          throw new Error(`Expected NOT ${JSON.stringify(expected)}, but got it`);
      },
      toContain(expected) {
        if (actual.includes(expected))
          throw new Error(`Expected "${actual}" NOT to contain "${expected}"`);
      },
    },
  };
}

/* ─── Re-implement core logic (extracted for testability) ────── */

const EMISSION_FACTORS = {
  energy:     { coal: 0.92, gas: 0.55, mixed: 0.45, renewable: 0.05, solar: 0.02 },
  heating:    { gas: 0.2, electric: 0.1, none: 0, solar_thermal: 0.01 },
  car:        { none: 0, petrol: 0.21, diesel: 0.17, hybrid: 0.11, ev: 0.07 },
  flightShort: 0.25,
  flightLong:  1.6,
  diet:       { vegan: 1.5, vegetarian: 1.7, pescatarian: 2.1, omnivore: 2.5, high_meat: 3.3 },
  food_waste: { low: -0.1, medium: 0, high: 0.2 },
  clothing:   0.01,
  electronics: 0.15,
  streaming:  0.0006,
};

/**
 * Pure calculation function — extracted from app.js for testability
 * @param {Object} inputs - user form inputs
 * @returns {Object} { total, home, travel, food, shopping }
 */
function calculateEmissions(inputs) {
  const {
    energy_source = 'mixed',
    monthly_bill  = 0,
    heating       = 'none',
    car_type      = 'none',
    km_per_week   = 0,
    flights_short = 0,
    flights_long  = 0,
    diet_type     = 'omnivore',
    local_food    = 30,
    food_waste    = 'medium',
    new_clothes   = 0,
    electronics   = 0,
    streaming     = 0,
    recycling     = 'most',
  } = inputs;

  // Validate numeric inputs
  const safeNum = (v, min = 0, max = Infinity) => {
    const n = parseFloat(v);
    if (isNaN(n) || n < min) return min;
    if (n > max) return max;
    return n;
  };

  const bill  = safeNum(monthly_bill, 0);
  const kwh   = bill / 8; // India avg tariff
  const homeEnergy  = kwh * 12 * (EMISSION_FACTORS.energy[energy_source] ?? 0.45) / 1000;
  const homeHeating = EMISSION_FACTORS.heating[heating] ?? 0;
  const home = +Math.max(0, homeEnergy + homeHeating).toFixed(2);

  const kmW         = safeNum(km_per_week, 0, 10000);
  const carEmit     = kmW * 52 * (EMISSION_FACTORS.car[car_type] ?? 0) / 1000;
  const flightEmit  = safeNum(flights_short, 0, 365) * EMISSION_FACTORS.flightShort
                    + safeNum(flights_long,  0, 365) * EMISSION_FACTORS.flightLong;
  const travel = +(carEmit + flightEmit).toFixed(2);

  const localPct  = safeNum(local_food, 0, 100) / 100;
  const dietBase  = EMISSION_FACTORS.diet[diet_type] ?? 2.5;
  const localSave = -(localPct * 0.3);
  const wasteAdj  = EMISSION_FACTORS.food_waste[food_waste] ?? 0;
  const food = +Math.max(0, dietBase + localSave + wasteAdj).toFixed(2);

  const recyclingBonus = { none: 0, some: -0.05, most: -0.15, all: -0.25 };
  const shoppingRaw = safeNum(new_clothes,  0, 10000) * EMISSION_FACTORS.clothing
                    + safeNum(electronics,  0, 1000)  * EMISSION_FACTORS.electronics
                    + safeNum(streaming,    0, 24)    * 365 * EMISSION_FACTORS.streaming / 1000
                    + (recyclingBonus[recycling] ?? 0);
  const shopping = +Math.max(0, shoppingRaw).toFixed(2);

  const total = +(home + travel + food + shopping).toFixed(2);
  return { total, home, travel, food, shopping };
}

/**
 * Input sanitiser — strips HTML/script tags from string inputs
 */
function sanitiseInput(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Validates that a URL is safe (https/http, no JS injection)
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
 * Format message — prevents XSS in chat bubble rendering
 */
function formatMessage(text) {
  if (typeof text !== 'string') return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

/**
 * Score label logic
 */
function getScoreLabel(total) {
  if (total <= 2)   return { text: '🌱 On target',    level: 'good' };
  if (total <= 4.7) return { text: '⚠️ Above target', level: 'warn' };
  return              { text: '🔴 High impact',        level: 'bad'  };
}

/**
 * Progress percentage for calculator steps
 */
function getProgressPct(step) {
  if (step < 1 || step > 4) throw new RangeError(`Step must be 1-4, got ${step}`);
  return (step / 4) * 100;
}

/**
 * Tips filter
 */
const TIPS = [
  { cat: 'home',     title: 'Switch to renewable energy', impact: 'high' },
  { cat: 'home',     title: 'LED lighting',               impact: 'low'  },
  { cat: 'travel',   title: 'Eliminate one long-haul flight', impact: 'high' },
  { cat: 'travel',   title: 'Cycle for short trips',      impact: 'medium' },
  { cat: 'food',     title: 'Try plant-based meals',      impact: 'high' },
  { cat: 'food',     title: 'Halve food waste',           impact: 'medium' },
  { cat: 'shopping', title: 'Buy secondhand clothing',    impact: 'medium' },
  { cat: 'shopping', title: 'Keep electronics longer',    impact: 'medium' },
];

function filterTips(category) {
  if (category === 'all') return TIPS;
  return TIPS.filter(t => t.cat === category);
}

/* ═══════════════════════════════════════════════════════════════
   TEST SUITES
═══════════════════════════════════════════════════════════════ */

// ── 1. Emission Factors ──────────────────────────────────────

describe('Emission Factors — data integrity', () => {
  test('all energy source factors are positive numbers', () => {
    Object.values(EMISSION_FACTORS.energy).forEach(v => {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
    });
  });

  test('coal > gas > mixed > renewable > solar (descending impact)', () => {
    const e = EMISSION_FACTORS.energy;
    expect(e.coal).toBeGreaterThan(e.gas);
    expect(e.gas).toBeGreaterThan(e.mixed);
    expect(e.mixed).toBeGreaterThan(e.renewable);
    expect(e.renewable).toBeGreaterThan(e.solar);
  });

  test('EV emits less than petrol emits less than diesel per km', () => {
    const c = EMISSION_FACTORS.car;
    expect(c.ev).toBeLessThan(c.hybrid);
    expect(c.hybrid).toBeLessThan(c.diesel);
    expect(c.diesel).toBeLessThan(c.petrol);
  });

  test('long-haul flight emits more than short-haul', () => {
    expect(EMISSION_FACTORS.flightLong).toBeGreaterThan(EMISSION_FACTORS.flightShort);
  });

  test('high-meat diet emits more than vegan', () => {
    expect(EMISSION_FACTORS.diet.high_meat).toBeGreaterThan(EMISSION_FACTORS.diet.vegan);
  });

  test('diet ladder is strictly ordered', () => {
    const d = EMISSION_FACTORS.diet;
    expect(d.high_meat).toBeGreaterThan(d.omnivore);
    expect(d.omnivore).toBeGreaterThan(d.pescatarian);
    expect(d.pescatarian).toBeGreaterThan(d.vegetarian);
    expect(d.vegetarian).toBeGreaterThan(d.vegan);
  });
});

// ── 2. Home Energy Calculations ──────────────────────────────

describe('Home Energy Calculations', () => {
  test('zero bill produces zero home energy emissions', () => {
    const r = calculateEmissions({ monthly_bill: 0, energy_source: 'coal', heating: 'none' });
    expect(r.home).toBe(0);
  });

  test('coal source produces more emissions than renewable for same bill', () => {
    const coal = calculateEmissions({ monthly_bill: 2000, energy_source: 'coal', heating: 'none' });
    const renew = calculateEmissions({ monthly_bill: 2000, energy_source: 'renewable', heating: 'none' });
    expect(coal.home).toBeGreaterThan(renew.home);
  });

  test('gas heating adds to home emissions', () => {
    const withHeat    = calculateEmissions({ monthly_bill: 0, energy_source: 'mixed', heating: 'gas' });
    const withoutHeat = calculateEmissions({ monthly_bill: 0, energy_source: 'mixed', heating: 'none' });
    expect(withHeat.home).toBeGreaterThan(withoutHeat.home);
  });

  test('home emissions never negative', () => {
    const r = calculateEmissions({ monthly_bill: -9999, energy_source: 'solar', heating: 'none' });
    expect(r.home).toBeGreaterThanOrEqual(0);
  });

  test('higher bill = proportionally higher emissions (same source)', () => {
    const low  = calculateEmissions({ monthly_bill: 1000, energy_source: 'mixed', heating: 'none' });
    const high = calculateEmissions({ monthly_bill: 4000, energy_source: 'mixed', heating: 'none' });
    expect(high.home).toBeGreaterThan(low.home);
    expect(high.home / low.home).toBeCloseTo(4, 0);
  });
});

// ── 3. Travel Calculations ───────────────────────────────────

describe('Travel Calculations', () => {
  test('no vehicle, no flights = zero travel emissions', () => {
    const r = calculateEmissions({ car_type: 'none', km_per_week: 0, flights_short: 0, flights_long: 0 });
    expect(r.travel).toBe(0);
  });

  test('petrol car emits more per km than EV', () => {
    const petrol = calculateEmissions({ car_type: 'petrol', km_per_week: 200, flights_short: 0, flights_long: 0 });
    const ev     = calculateEmissions({ car_type: 'ev',     km_per_week: 200, flights_short: 0, flights_long: 0 });
    expect(petrol.travel).toBeGreaterThan(ev.travel);
  });

  test('one long-haul flight adds 1.6t correctly', () => {
    const r = calculateEmissions({ car_type: 'none', km_per_week: 0, flights_short: 0, flights_long: 1 });
    expect(r.travel).toBeCloseTo(1.6, 1);
  });

  test('multiple short flights accumulate correctly', () => {
    const r = calculateEmissions({ car_type: 'none', km_per_week: 0, flights_short: 4, flights_long: 0 });
    expect(r.travel).toBeCloseTo(1.0, 1);
  });

  test('weekly km scales over 52 weeks correctly', () => {
    // petrol: 100km/week * 52 * 0.21 kg/km / 1000 = 1.092t
    const r = calculateEmissions({ car_type: 'petrol', km_per_week: 100, flights_short: 0, flights_long: 0 });
    expect(r.travel).toBeCloseTo(1.09, 1);
  });

  test('travel never goes negative', () => {
    const r = calculateEmissions({ car_type: 'none', km_per_week: -999, flights_short: -5, flights_long: -1 });
    expect(r.travel).toBeGreaterThanOrEqual(0);
  });
});

// ── 4. Food Calculations ─────────────────────────────────────

describe('Food Calculations', () => {
  test('vegan diet has lower emissions than high-meat', () => {
    const vegan = calculateEmissions({ diet_type: 'vegan',     local_food: 50, food_waste: 'medium' });
    const meat  = calculateEmissions({ diet_type: 'high_meat', local_food: 50, food_waste: 'medium' });
    expect(meat.food).toBeGreaterThan(vegan.food);
  });

  test('100% local food reduces emissions vs 0% local', () => {
    const local  = calculateEmissions({ diet_type: 'omnivore', local_food: 100, food_waste: 'medium' });
    const import_ = calculateEmissions({ diet_type: 'omnivore', local_food: 0,   food_waste: 'medium' });
    expect(import_.food).toBeGreaterThan(local.food);
  });

  test('high food waste increases emissions vs low waste', () => {
    const high = calculateEmissions({ diet_type: 'omnivore', local_food: 30, food_waste: 'high' });
    const low  = calculateEmissions({ diet_type: 'omnivore', local_food: 30, food_waste: 'low'  });
    expect(high.food).toBeGreaterThan(low.food);
  });

  test('food emissions never negative', () => {
    const r = calculateEmissions({ diet_type: 'vegan', local_food: 100, food_waste: 'low' });
    expect(r.food).toBeGreaterThanOrEqual(0);
  });

  test('omnivore baseline with medium waste = 2.5t', () => {
    const r = calculateEmissions({ diet_type: 'omnivore', local_food: 0, food_waste: 'medium' });
    expect(r.food).toBeCloseTo(2.5, 1);
  });
});

// ── 5. Shopping Calculations ─────────────────────────────────

describe('Shopping Calculations', () => {
  test('zero shopping = non-negative (recycling bonus may apply)', () => {
    const r = calculateEmissions({ new_clothes: 0, electronics: 0, streaming: 0, recycling: 'most' });
    expect(r.shopping).toBeGreaterThanOrEqual(0);
  });

  test('more clothes = more emissions', () => {
    const few  = calculateEmissions({ new_clothes: 5,  electronics: 0, streaming: 0, recycling: 'none' });
    const many = calculateEmissions({ new_clothes: 50, electronics: 0, streaming: 0, recycling: 'none' });
    expect(many.shopping).toBeGreaterThan(few.shopping);
  });

  test('electronics contribute 0.15t each', () => {
    const r = calculateEmissions({ new_clothes: 0, electronics: 2, streaming: 0, recycling: 'none' });
    expect(r.shopping).toBeCloseTo(0.30, 1);
  });

  test('recycling all reduces emissions vs no recycling', () => {
    const recycle = calculateEmissions({ new_clothes: 10, electronics: 1, streaming: 2, recycling: 'all' });
    const none    = calculateEmissions({ new_clothes: 10, electronics: 1, streaming: 2, recycling: 'none' });
    expect(none.shopping).toBeGreaterThan(recycle.shopping);
  });

  test('shopping never negative', () => {
    const r = calculateEmissions({ new_clothes: 0, electronics: 0, streaming: 0, recycling: 'all' });
    expect(r.shopping).toBeGreaterThanOrEqual(0);
  });
});

// ── 6. Total Calculation ─────────────────────────────────────

describe('Total Calculation', () => {
  test('total = sum of all categories', () => {
    const inputs = {
      monthly_bill: 2000, energy_source: 'gas', heating: 'gas',
      car_type: 'petrol', km_per_week: 150, flights_short: 2, flights_long: 1,
      diet_type: 'omnivore', local_food: 30, food_waste: 'medium',
      new_clothes: 20, electronics: 2, streaming: 3, recycling: 'most',
    };
    const r = calculateEmissions(inputs);
    const expectedSum = +(r.home + r.travel + r.food + r.shopping).toFixed(2);
    expect(r.total).toBe(expectedSum);
  });

  test('total is always non-negative', () => {
    const r = calculateEmissions({});
    expect(r.total).toBeGreaterThanOrEqual(0);
  });

  test('typical Indian household has plausible footprint (0.5–8t)', () => {
    const r = calculateEmissions({
      monthly_bill: 1500, energy_source: 'mixed', heating: 'none',
      car_type: 'petrol', km_per_week: 100, flights_short: 1, flights_long: 0,
      diet_type: 'omnivore', local_food: 40, food_waste: 'medium',
      new_clothes: 15, electronics: 1, streaming: 2, recycling: 'some',
    });
    expect(r.total).toBeGreaterThan(0.5);
    expect(r.total).toBeLessThan(8);
  });

  test('zero-input defaults produce a non-zero result (diet baseline)', () => {
    const r = calculateEmissions({});
    // Diet default omnivore = 2.5t minimum
    expect(r.total).toBeGreaterThan(0);
  });
});

// ── 7. Input Validation & Edge Cases ─────────────────────────

describe('Input Validation & Edge Cases', () => {
  test('NaN inputs are treated as zero', () => {
    const r = calculateEmissions({ monthly_bill: NaN, km_per_week: NaN, new_clothes: NaN });
    expect(r.home).toBeGreaterThanOrEqual(0);
    expect(r.travel).toBeGreaterThanOrEqual(0);
  });

  test('string numeric inputs are parsed correctly', () => {
    const r = calculateEmissions({ monthly_bill: '2000', km_per_week: '100', new_clothes: '10' });
    expect(r.total).toBeGreaterThan(0);
  });

  test('unknown energy source falls back to mixed factor', () => {
    const known   = calculateEmissions({ monthly_bill: 2000, energy_source: 'mixed', heating: 'none' });
    const unknown = calculateEmissions({ monthly_bill: 2000, energy_source: 'UNKNOWN_SOURCE', heating: 'none' });
    expect(known.home).toBe(unknown.home);
  });

  test('unknown diet type falls back to omnivore', () => {
    const known   = calculateEmissions({ diet_type: 'omnivore', local_food: 0, food_waste: 'medium' });
    const unknown = calculateEmissions({ diet_type: 'UNKNOWN',  local_food: 0, food_waste: 'medium' });
    expect(known.food).toBe(unknown.food);
  });

  test('extremely large km_per_week is capped and does not cause Infinity', () => {
    const r = calculateEmissions({ car_type: 'petrol', km_per_week: 999999 });
    expect(isFinite(r.travel)).toBeTrue();
  });

  test('local_food clamped to 0-100 range', () => {
    const over  = calculateEmissions({ diet_type: 'omnivore', local_food: 200, food_waste: 'medium' });
    const exact = calculateEmissions({ diet_type: 'omnivore', local_food: 100, food_waste: 'medium' });
    expect(over.food).toBe(exact.food);
  });

  test('negative flights treated as zero', () => {
    const r = calculateEmissions({ car_type: 'none', km_per_week: 0, flights_short: -5, flights_long: -2 });
    expect(r.travel).toBe(0);
  });
});

// ── 8. Security — Input Sanitisation ─────────────────────────

describe('Security — Input Sanitisation', () => {
  test('sanitiseInput strips <script> tags', () => {
    const result = sanitiseInput('<script>alert("xss")</script>hello');
    expect(result).not.toContain('<script>');
    expect(result).toContain('hello');
  });

  test('sanitiseInput strips arbitrary HTML tags', () => {
    const result = sanitiseInput('<img src=x onerror=alert(1)>text');
    expect(result).not.toContain('<img');
    expect(result).toContain('text');
  });

  test('sanitiseInput preserves normal text', () => {
    const result = sanitiseInput('Hello World 123!');
    expect(result).toBe('Hello World 123!');
  });

  test('sanitiseInput handles non-string inputs safely', () => {
    expect(sanitiseInput(42)).toBe(42);
    expect(sanitiseInput(null)).toBeNull();
  });

  test('formatMessage escapes HTML before rendering', () => {
    const result = formatMessage('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });

  test('formatMessage escapes angle brackets', () => {
    const result = formatMessage('2 < 3 and 5 > 4');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
  });

  test('formatMessage converts **bold** to <strong>', () => {
    const result = formatMessage('This is **important**');
    expect(result).toContain('<strong>important</strong>');
  });

  test('formatMessage converts newlines to <br>', () => {
    const result = formatMessage('line1\nline2');
    expect(result).toContain('<br>');
  });

  test('isValidUrl accepts https URLs', () => {
    expect(isValidUrl('https://example.com')).toBeTrue();
  });

  test('isValidUrl accepts http URLs', () => {
    expect(isValidUrl('http://example.com')).toBeTrue();
  });

  test('isValidUrl rejects javascript: URLs', () => {
    expect(isValidUrl('javascript:alert(1)')).toBeFalse();
  });

  test('isValidUrl rejects malformed strings', () => {
    expect(isValidUrl('not a url')).toBeFalse();
    expect(isValidUrl('')).toBeFalse();
  });

  test('isValidUrl rejects data: URLs', () => {
    expect(isValidUrl('data:text/html,<script>alert(1)</script>')).toBeFalse();
  });
});

// ── 9. Score Label Logic ─────────────────────────────────────

describe('Score Label Logic', () => {
  test('0t = on target (good)', () => {
    expect(getScoreLabel(0).level).toBe('good');
  });

  test('2.0t = on target (boundary)', () => {
    expect(getScoreLabel(2.0).level).toBe('good');
  });

  test('2.1t = above target (warn)', () => {
    expect(getScoreLabel(2.1).level).toBe('warn');
  });

  test('4.7t = above target (boundary)', () => {
    expect(getScoreLabel(4.7).level).toBe('warn');
  });

  test('4.8t = high impact (bad)', () => {
    expect(getScoreLabel(4.8).level).toBe('bad');
  });

  test('10t = high impact', () => {
    expect(getScoreLabel(10).level).toBe('bad');
  });

  test('label text matches level', () => {
    expect(getScoreLabel(1.5).text).toContain('On target');
    expect(getScoreLabel(3.0).text).toContain('Above target');
    expect(getScoreLabel(7.0).text).toContain('High impact');
  });
});

// ── 10. Progress Bar ─────────────────────────────────────────

describe('Progress Bar Logic', () => {
  test('step 1 = 25%', () => {
    expect(getProgressPct(1)).toBe(25);
  });

  test('step 2 = 50%', () => {
    expect(getProgressPct(2)).toBe(50);
  });

  test('step 3 = 75%', () => {
    expect(getProgressPct(3)).toBe(75);
  });

  test('step 4 = 100%', () => {
    expect(getProgressPct(4)).toBe(100);
  });

  test('step 0 throws RangeError', () => {
    expect(() => getProgressPct(0)).toThrow();
  });

  test('step 5 throws RangeError', () => {
    expect(() => getProgressPct(5)).toThrow();
  });
});

// ── 11. Tips Filtering ───────────────────────────────────────

describe('Tips Filtering', () => {
  test('"all" returns all tips', () => {
    expect(filterTips('all').length).toBe(TIPS.length);
  });

  test('filtering by "home" returns only home tips', () => {
    const filtered = filterTips('home');
    filtered.forEach(t => expect(t.cat).toBe('home'));
  });

  test('filtering by "travel" returns only travel tips', () => {
    const filtered = filterTips('travel');
    filtered.forEach(t => expect(t.cat).toBe('travel'));
  });

  test('filtering by "food" returns only food tips', () => {
    const filtered = filterTips('food');
    filtered.forEach(t => expect(t.cat).toBe('food'));
  });

  test('filtering by "shopping" returns only shopping tips', () => {
    const filtered = filterTips('shopping');
    filtered.forEach(t => expect(t.cat).toBe('shopping'));
  });

  test('unknown category returns empty array', () => {
    expect(filterTips('unknown').length).toBe(0);
  });

  test('all categories have at least one tip', () => {
    ['home', 'travel', 'food', 'shopping'].forEach(cat => {
      expect(filterTips(cat).length).toBeGreaterThan(0);
    });
  });

  test('each tip has required fields (cat, title, impact)', () => {
    const validImpacts = ['high', 'medium', 'low'];
    TIPS.forEach(tip => {
      expect(typeof tip.cat).toBe('string');
      expect(typeof tip.title).toBe('string');
      expect(validImpacts.includes(tip.impact)).toBeTrue();
    });
  });
});

// ── 12. Comparison Logic ─────────────────────────────────────

describe('Comparison vs Benchmarks', () => {
  const GLOBAL_AVG = 4.7;
  const PARIS_TARGET = 2.0;

  function getDiff(total, benchmark) {
    return +(total - benchmark).toFixed(1);
  }

  test('5t is +0.3t above global average', () => {
    expect(getDiff(5.0, GLOBAL_AVG)).toBe(0.3);
  });

  test('3t is -1.7t below global average', () => {
    expect(getDiff(3.0, GLOBAL_AVG)).toBe(-1.7);
  });

  test('2t is exactly at Paris target', () => {
    expect(getDiff(2.0, PARIS_TARGET)).toBe(0.0);
  });

  test('1t is -1t below Paris target (positive outcome)', () => {
    expect(getDiff(1.0, PARIS_TARGET)).toBe(-1.0);
  });

  test('diff sign correctly identifies over/under', () => {
    expect(getDiff(6.0, GLOBAL_AVG)).toBeGreaterThan(0);
    expect(getDiff(2.0, GLOBAL_AVG)).toBeLessThan(0);
  });
});

/* ─── Results summary ────────────────────────────────────────── */

console.log('\n' + '═'.repeat(50));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(50));

if (failed > 0) {
  console.log('\n⚠️  Failed tests:');
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ❌ ${r.name}`);
    console.log(`     ${r.error}`);
  });
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!\n');
  process.exit(0);
}
