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
  const { message, modelId, imageDataUrl } = req.body;
  if (!message && !imageDataUrl) return res.status(400).json({ error: 'message is required' });

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
    const reply = await callProvider(target.provider.id, apiKey, target.model.id, message, imageDataUrl, target.model.rules, config.globalRules);
    res.json({ reply, model: target.model.customName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ reply: 'That model failed to respond. Try again or switch models.', model: 'system' });
  }
});

function buildUserContent(message, imageDataUrl) {
  if (!imageDataUrl) return message || '';
  return [
    { type: 'text', text: message || 'Describe this image.' },
    { type: 'image_url', image_url: { url: imageDataUrl } }
  ];
}

async function callProvider(providerId, apiKey, modelId, message, imageDataUrl, modelRules, globalRules) {
  const systemPrompt = [globalRules, modelRules].filter(Boolean).join('\n');

  if (providerId === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: buildUserContent(message, imageDataUrl) }
        ]
      })
    });
    const data = await r.json();
    return data.choices?.[0]?.message?.content || 'No reply.';
  }

  if (providerId === 'google') {
    const parts = [{ text: message || 'Describe this image.' }];
    if (imageDataUrl) {
      const match = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
      if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
    }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await r.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No reply.';
  }

  if (providerId === 'groq') {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        reasoning_format: 'hidden',
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: buildUserContent(message, imageDataUrl) }
        ]
      })
    });
    const raw = await r.text();
    if (!r.ok) {
      console.error(`Groq returned status ${r.status}:`, raw.slice(0, 500));
      throw new Error(`Groq request failed (status ${r.status})`);
    }
    const data = JSON.parse(raw);
    return data.choices?.[0]?.message?.content || 'No reply.';
  }

  if (providerId === 'huggingface' || providerId === 'hugging-face') {
    const r = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: buildUserContent(message, imageDataUrl) }
        ]
      })
    });
    const raw = await r.text();
    if (!r.ok) {
      console.error(`Hugging Face returned status ${r.status}:`, raw.slice(0, 500));
      throw new Error(`Hugging Face request failed (status ${r.status})`);
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.error('Hugging Face returned non-JSON:', raw.slice(0, 500));
      throw new Error('Hugging Face returned an unexpected response.');
    }
    return data.choices?.[0]?.message?.content || 'No reply.';
  }

  throw new Error(`No handler wired up for provider "${providerId}" yet.`);
}

module.exports = router;
