const express = require('express');
const router = express.Router();

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'talal:latest';

const taskHistory = [];
let taskCounter = 0;

function recordTask(agent, input, mode) {
  const task = { id: ++taskCounter, agent, status: 'running', input, output: null, mode, startedAt: new Date().toISOString(), finishedAt: null, error: null };
  taskHistory.unshift(task);
  if (taskHistory.length > 200) taskHistory.pop();
  return task;
}

function finishTask(task, output) {
  task.status = 'completed';
  task.output = output;
  task.finishedAt = new Date().toISOString();
}

function failTask(task, err) {
  task.status = 'failed';
  task.error = String(err.message || err);
  task.finishedAt = new Date().toISOString();
}

async function askOllama(systemPrompt, userPrompt, expectJson = true) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: expectJson ? 'json' : undefined,
        options: { temperature: 0.4 },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    const content = data?.message?.content || '';
    if (!expectJson) return content;
    try { return JSON.parse(content); }
    catch {
      const match = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
      throw new Error('Invalid JSON');
    }
  } catch (e) {
    throw e;
  }
}

async function ollamaHealthy() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    return { ok: true, models, activeModel: OLLAMA_MODEL };
  } catch (e) {
    return { ok: false, error: String(e.message) };
  }
}

const MOCK_PRODUCTS = [
  { id: 'p1', title: 'Magnetic Phone Mount 360', cost: 3.2, stock: 142, supplier: 'AliExpress', category: 'Accessories' },
  { id: 'p2', title: 'LED Galaxy Projector', cost: 8.5, stock: 12, supplier: 'CJ Dropshipping', category: 'Home' },
  { id: 'p3', title: 'Portable Blender Pro', cost: 11.9, stock: 0, supplier: 'AliExpress', category: 'Kitchen' },
  { id: 'p4', title: 'Posture Corrector Belt', cost: 4.1, stock: 87, supplier: 'Zendrop', category: 'Health' },
  { id: 'p5', title: 'Mini Thermal Printer', cost: 14.3, stock: 5, supplier: 'CJ Dropshipping', category: 'Office' },
  { id: 'p6', title: 'Car Vacuum Cleaner USB', cost: 7.7, stock: 230, supplier: 'AliExpress', category: 'Auto' },
];

async function runProductResearch({ niche = 'general', count = 5 }) {
  const system = `You are a dropshipping expert. Respond ONLY with JSON:
{"products":[{"name":"","why":"","audience":"","cost":0,"price":0,"competition":"low|medium|high","score":0}]}`;
  const user = `Find ${count} products in: "${niche}". Return JSON only.`;
  const result = await askOllama(system, user, true);
  const products = Array.isArray(result.products) ? result.products : [];
  products.sort((a, b) => (b.score || 0) - (a.score || 0));
  return { niche, count: products.length, products };
}

function formulaPricing(cost, shipping) {
  const landed = cost + shipping;
  const multiplier = landed < 10 ? 3 : landed < 25 ? 2.5 : 2.2;
  let price = landed * multiplier;
  price = Math.max(price, landed + 8);
  price = Math.floor(price) + 0.99;
  const margin = price - landed;
  return {
    landed_cost: +landed.toFixed(2),
    suggested_price: +price.toFixed(2),
    profit_per_unit: +margin.toFixed(2),
    margin_percent: +((margin / price) * 100).toFixed(1),
    method: 'formula',
  };
}

async function runPricing({ productName = 'Product', cost = 0, shipping = 0, useAI = true }) {
  cost = parseFloat(cost) || 0;
  shipping = parseFloat(shipping) || 0;
  const base = formulaPricing(cost, shipping);
  if (!useAI) return { product: productName, ...base };
  try {
    const system = `You're a pricing expert. JSON only:
{"price":0,"compare_at":0,"margin_note":"","upsell":""}`;
    const user = `Product: "${productName}", landed cost: $${base.landed_cost}. Formula suggests $${base.suggested_price}. Refine it.`;
    const ai = await askOllama(system, user, true);
    const price = parseFloat(ai.price) || base.suggested_price;
    const margin = price - base.landed_cost;
    return {
      product: productName,
      landed_cost: base.landed_cost,
      suggested_price: +price.toFixed(2),
      compare_at_price: parseFloat(ai.compare_at) || +(price * 1.6).toFixed(2),
      profit_per_unit: +margin.toFixed(2),
      margin_percent: +((margin / price) * 100).toFixed(1),
      note: ai.margin_note || '',
      upsell: ai.upsell || '',
      method: 'ai+formula',
    };
  } catch {
    return { product: productName, ...base, note: 'AI unavailable' };
  }
}

async function runInventory({ mode = 'mock', lowThreshold = 15 }) {
  const products = mode === 'mock' ? MOCK_PRODUCTS : [];
  const outOfStock = products.filter(p => p.stock <= 0);
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= lowThreshold);
  const healthy = products.filter(p => p.stock > lowThreshold);
  let aiAdvice = '';
  try {
    if (outOfStock.length || lowStock.length) {
      const system = `Inventory advisor, JSON: {"advice":""}`;
      const user = `Out: ${outOfStock.map(p => p.title).join(', ') || 'none'}. Low: ${lowStock.map(p => `${p.title}(${p.stock})`).join(', ') || 'none'}.`;
      const ai = await askOllama(system, user, true);
      aiAdvice = ai.advice || '';
    }
  } catch { }
  return {
    mode,
    total_products: products.length,
    summary: { out_of_stock: outOfStock.length, low_stock: lowStock.length, healthy: healthy.length },
    out_of_stock: outOfStock.map(p => ({ id: p.id, title: p.title })),
    low_stock: lowStock.map(p => ({ id: p.id, title: p.title, stock: p.stock })),
    ai_advice: aiAdvice,
  };
}

router.get('/health', async (_req, res) => {
  const health = await ollamaHealthy();
  res.json({ engine: 'ok', ollama: health, mode: 'mock' });
});

router.get('/tasks', (_req, res) => {
  res.json({ tasks: taskHistory.slice(0, 50) });
});

router.post('/run/research', async (req, res) => {
  const input = { niche: req.body?.niche || 'general', count: req.body?.count || 5 };
  const task = recordTask('Product Research', input, 'ai');
  try {
    const output = await runProductResearch(input);
    finishTask(task, output);
    res.json({ ok: true, task_id: task.id, result: output });
  } catch (e) {
    failTask(task, e);
    res.status(500).json({ ok: false, task_id: task.id, error: task.error });
  }
});

router.post('/run/pricing', async (req, res) => {
  const input = {
    productName: req.body?.productName || 'Product',
    cost: req.body?.cost ?? 0,
    shipping: req.body?.shipping ?? 0,
    useAI: req.body?.useAI !== false,
  };
  const task = recordTask('Pricing', input, input.useAI ? 'ai' : 'formula');
  try {
    const output = await runPricing(input);
    finishTask(task, output);
    res.json({ ok: true, task_id: task.id, result: output });
  } catch (e) {
    failTask(task, e);
    res.status(500).json({ ok: false, task_id: task.id, error: task.error });
  }
});

router.post('/run/inventory', async (req, res) => {
  const input = { mode: req.body?.mode || 'mock', lowThreshold: req.body?.lowThreshold ?? 15 };
  const task = recordTask('Inventory', input, input.mode);
  try {
    const output = await runInventory(input);
    finishTask(task, output);
    res.json({ ok: true, task_id: task.id, result: output });
  } catch (e) {
    failTask(task, e);
    res.status(500).json({ ok: false, task_id: task.id, error: task.error });
  }
});

module.exports = { router };