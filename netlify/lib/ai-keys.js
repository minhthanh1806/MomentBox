// Helper dùng chung cho xác thực API key, giới hạn timeout và gọi LLM dự phòng

const isGeminiKey = (k) => !!k && (k.startsWith('AIzaSy') || k.startsWith('AQ.')) && k.length > 25

// Key OpenAI hợp lệ phải bắt đầu bằng sk- và đủ dài (tránh chuỗi mẫu trong .env)
const isOpenAiKey = (k) =>
  !!k && k.startsWith('sk-') && k.length > 35 && !/your_|example|placeholder/i.test(k)

const getKeys = () => {
  const raw = [process.env.GEMINI_API_KEY, process.env.OPENAI_API_KEY].filter(Boolean).map((k) => k.trim())
  const geminiKey = raw.find(isGeminiKey) || ''
  const openaiKey = raw.find(isOpenAiKey) || ''
  const cfAccount = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim()
  const cfToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim()
  const hfToken = (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || '').trim()
  return { geminiKey, openaiKey, cfAccount, cfToken, hfToken }
}

const timedFetch = async (url, options = {}, ms = 15000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const CF_TEXT_MODELS = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct-fast',
]

// Gọi LLM chữ trên Cloudflare Workers AI (tự thử model dự phòng nếu model chính lỗi)
const callCloudflareChat = async ({ cfAccount, cfToken, messages, systemPrompt, temperature = 0.6, maxTokens = 800, timeoutMs = 15000, fast = false }) => {
  if (!cfAccount || !cfToken) return { ok: false, status: 503, message: 'Chưa cấu hình Cloudflare.' }

  const cfMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : [...messages]

  const models = fast ? [CF_TEXT_MODELS[1], CF_TEXT_MODELS[0]] : CF_TEXT_MODELS
  let lastError = { status: 503, message: 'Cloudflare AI đang bận.' }
  for (const model of models) {
    try {
      const res = await timedFetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/${model}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfToken}`,
          },
          body: JSON.stringify({
            messages: cfMessages,
            temperature,
            max_tokens: maxTokens,
          }),
        },
        timeoutMs
      )

      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const rawResp = data?.result?.response
        const text =
          typeof rawResp === 'string'
            ? rawResp.trim()
            : rawResp && typeof rawResp === 'object'
              ? JSON.stringify(rawResp)
              : ''
        if (text) return { ok: true, text, model }
        lastError = { status: 502, message: `Cloudflare ${model} trả về rỗng.` }
      } else {
        const err = await res.json().catch(() => ({}))
        lastError = {
          status: res.status,
          message: err?.errors?.[0]?.message || `Cloudflare ${model} lỗi (${res.status}).`,
        }
        console.warn(`[cf-text] ${model} failed (${res.status}): ${lastError.message}`)
        if (res.status === 429 || res.status === 401 || res.status === 403) break
      }
    } catch (err) {
      lastError = {
        status: 502,
        message: err instanceof Error ? (err.name === 'AbortError' ? 'Quá thời gian chờ Cloudflare' : err.message) : String(err),
      }
    }
  }
  return { ok: false, ...lastError }
}

// Nhìn ảnh dùng chung: Gemini Vision -> fallback Cloudflare LLaVA Vision
const inspectImageWithVision = async ({ mimeType = 'image/jpeg', base64, prompt, keys, maxTokens = 160 }) => {
  if (!base64) return ''

  if (keys.geminiKey) {
    try {
      const res = await timedFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keys.geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }],
              },
            ],
            generationConfig: { temperature: 0.2, maxOutputTokens: Math.max(maxTokens, 180) },
          }),
        },
        6000
      )
      if (res.ok) {
        const data = await res.json()
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim()
        if (text) return text
      }
    } catch (err) {
      // chuyển sang Cloudflare Vision
    }
  }

  if (keys.cfAccount && keys.cfToken) {
    try {
      const bytes = Array.from(Buffer.from(base64, 'base64'))
      const res = await timedFetch(
        `https://api.cloudflare.com/client/v4/accounts/${keys.cfAccount}/ai/run/@cf/llava-hf/llava-1.5-7b-hf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${keys.cfToken}`,
          },
          body: JSON.stringify({
            prompt,
            image: bytes,
            max_tokens: maxTokens,
          }),
        },
        10000
      )
      if (res.ok) {
        const data = await res.json().catch(() => ({}))
        const desc = data?.result?.description?.trim()
        if (desc) return desc
      }
    } catch (err) {
      console.warn('[vision] LLaVA failed:', err instanceof Error ? err.message : String(err))
    }
  }

  return ''
}

module.exports = {
  isGeminiKey,
  isOpenAiKey,
  getKeys,
  timedFetch,
  callCloudflareChat,
  inspectImageWithVision,
}
