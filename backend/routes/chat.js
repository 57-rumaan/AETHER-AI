const express = require('express');
const router = express.Router();
const { loadModelConfig } = require('../config/store');

router.get('/models', async (req, res) => {
  try {
    const config = await loadModelConfig();
    const list = [];
    for (const provider of config.providers) {
      for (const model of provider.models) {
        if (model.enabled) list.push({ id: model.id, customName: model.customName });
      }
    }
    res.json(list);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
});

router.post('/', async (req, res) => {
  const { message, modelId } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });

  let config;
  try {
    config = await loadModelConfig();
  } catch (err) {
    console.error(err);
    return res.json({ reply: 'Could not reach the settings store. Check JSONBIN_BIN_ID / JSONBIN_API_KEY on the server.', model: 'system' });
  }

  let target = null;
  for (const provider of config.providers) {
    for (const model of provider.models) {
      if (!model.enabled) continue;
      if (modelId ? model.id === modelId : !target) {
        target = { provider, model };
      }
    }
  }

  if (!target) {
    return res.json({ reply: 'No AI model is enabled yet. An admin needs to add and enable one in the admin panel.', model: 'system' });
  }

  const apiKey = process.env[target.provider.apiKeyEnv];
  if (!apiKey) {
    return res.json({ reply: `Model "${target.model.customName}" is enabled but its API key (${target.provider.apiKeyEnv}) isn't set on the server yet.`, model: 'system' });
  }

  try {
    const reply = await callProvider(target.provider.id, apiKey, target.model.id, message, target.model.rules, config.globalRules);
    res.json({ reply, model: target.model.customName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: 'That model failed to respond. Try again or switch models.', model: 'system' });
  }
});

async function callProvider(providerId, apiKey, modelId, message, modelRules, globalRules) {
  const systemPrompt = [globalRules, modelRules].filter(Boolean).join('\n');

  if (providerId === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: message }
        ]
      })
    });
    const data = await r.json();
    return data.choices?.[0]?.message?.content || 'No reply.';
  }

  if (providerId === 'google') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: message }] }] })
    });
    const data = await r.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply.';
  }

  if (providerId === 'huggingface' || providerId === 'hugging-face') {
    const r = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: message }
        ]
      })
    });
    const data = await r.json();
    return data.choices?.[0]?.message?.content || 'No reply.';
  }

  throw new Error(`No handler wired up for provider "${providerId}" yet.`);
}

module.exports = router;
