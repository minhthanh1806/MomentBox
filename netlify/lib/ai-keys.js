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

// Bảng hạn mức thực tế (RPD / RPM) cho đủ 23 model thuộc 4 nhóm
const MODEL_SPECS = {
  // Nhóm 1: 11 model Gemini Chữ & Vision (REST)
  'gemini-3.5-flash-lite': { rpd: 500, rpm: 15 },
  'gemini-3.1-flash-lite': { rpd: 500, rpm: 15 },
  'gemini-flash-lite-latest': { rpd: 20, rpm: 10 },
  'gemini-3.8-flash': { rpd: 20, rpm: 5 },
  'gemini-3.6-flash': { rpd: 20, rpm: 5 },
  'gemini-3.5-flash': { rpd: 20, rpm: 5 },
  'gemini-3-flash-preview': { rpd: 20, rpm: 5 },
  'gemini-4-hydrogen': { rpd: 20, rpm: 5 },
  'gemini-robotics-er-2-preview': { rpd: 20, rpm: 5 },
  'gemini-2.5-flash': { rpd: 20, rpm: 5 },
  'gemini-3.7-flash': { rpd: 20, rpm: 5 },
  // Nhóm 2: 2 model Gemma (14.400 lượt/ngày)
  'gemma-4-31b-it': { rpd: 14400, rpm: 30 },
  'gemma-4-26b-a4b-it': { rpd: 14400, rpm: 30 },

  // Nhóm 3: 3 model Gemini Live (Illimité qua WebSocket)
  'gemini-3.8-live': { rpd: Infinity, rpm: Infinity },
  'gemini-3.1-flash-live-preview': { rpd: Infinity, rpm: Infinity },
  'gemini-2.5-flash-native-audio-latest': { rpd: Infinity, rpm: Infinity },
  // Nhóm 4: 7 model Gemini Tạo ảnh (Nano Banana)
  'gemini-3.1-flash-lite-image': { rpd: 500, rpm: 15 },
  'gemini-2.5-flash-image': { rpd: 20, rpm: 5 },
  'gemini-3.1-flash-image': { rpd: 20, rpm: 5 },
  'gemini-3.1-flash-image-preview': { rpd: 20, rpm: 5 },
  'gemini-nano-banana-2.1': { rpd: 20, rpm: 5 },
  'gemini-3-pro-image': { rpd: 20, rpm: 5 },
  'gemini-3-pro-image-preview': { rpd: 20, rpm: 5 },
}

const GEMINI_VISION_TEXT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-4-hydrogen',
  'gemini-robotics-er-2-preview',
  'gemini-2.5-flash',
  'gemini-3.7-flash',
]

const GEMINI_GEMMA_MODELS = ['gemma-4-31b-it', 'gemma-4-26b-a4b-it']
const GEMINI_CHAT_MODELS = [...GEMINI_VISION_TEXT_MODELS, ...GEMINI_GEMMA_MODELS]

// Nhóm Gemini Live có hạn mức 0 / Illimité (không giới hạn lượt/ngày), chạy qua WebSocket BidiGenerateContent
const GEMINI_LIVE_MODELS = [
  'gemini-3.8-live',
  'gemini-3.1-flash-live-preview',
  'gemini-2.5-flash-native-audio-latest',
]

const GEMINI_IMAGE_MODELS = [
  'gemini-3.1-flash-lite-image',
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-image-preview',
  'gemini-nano-banana-2.1',
  'gemini-3-pro-image',
  'gemini-3-pro-image-preview',
]

// Ghi nhớ số lượt đã dùng trong ngày & model nào vừa chạm trần để ưu tiên bản còn nhiều lượt nhất
const exhaustedGeminiModels = new Map()
const modelUsage = new Map()

const utcDayKey = () => new Date().toISOString().slice(0, 10)

const getUsedToday = (model) => {
  const today = utcDayKey()
  const rec = modelUsage.get(model)
  if (!rec || rec.day !== today) return 0
  return rec.used
}

const recordModelSuccess = (model) => {
  const today = utcDayKey()
  modelUsage.set(model, { day: today, used: getUsedToday(model) + 1 })
}

const remainingQuotaScore = (model) => {
  const spec = MODEL_SPECS[model] || { rpd: 20, rpm: 5 }
  if (!Number.isFinite(spec.rpd)) return Infinity
  return Math.max(0, spec.rpd - getUsedToday(model))
}

const sortByRemainingQuota = (list) =>
  [...list].sort((a, b) => {
    const remDiff = remainingQuotaScore(b) - remainingQuotaScore(a)
    if (remDiff !== 0) return remDiff
    const rpmDiff = (MODEL_SPECS[b]?.rpm || 5) - (MODEL_SPECS[a]?.rpm || 5)
    return rpmDiff
  })

const markModelExhausted = (model, status, errorMessage = '') => {
  const now = Date.now()
  if (status === 404) {
    exhaustedGeminiModels.set(model, { until: now + 24 * 60 * 60 * 1000, reason: 'missing' })
  } else if (status === 429 && /per[_\s-]?day|rpd|limit:\s*0\b|free[_\s-]?tier|current quota/i.test(errorMessage)) {
    exhaustedGeminiModels.set(model, { until: now + 30 * 60 * 1000, reason: 'daily' })
  } else if (status === 429 || status === 503) {
    exhaustedGeminiModels.set(model, { until: now + 45 * 1000, reason: 'short' })
  }
}

// Xếp các bản chưa hết hạn theo số lượt còn lại nhiều nhất -> nếu hết hết mới sang nhóm/hãng mới
const rankModelsByQuota = (modelList) => {
  const now = Date.now()
  const fresh = []
  const shortCooldown = []

  for (const model of modelList) {
    const info = exhaustedGeminiModels.get(model)
    if (!info || info.until <= now) {
      if (info) exhaustedGeminiModels.delete(model)
      fresh.push(model)
    } else if (info.reason === 'short') {
      shortCooldown.push(model)
    }
  }

  if (fresh.length > 0) return sortByRemainingQuota(fresh)
  if (shortCooldown.length > 0) return sortByRemainingQuota(shortCooldown)
  // Tất cả các bản trong nhóm đều đang trong thời gian chờ hết hạn ngày -> chuyển thẳng sang nhóm/hãng mới
  return []
}

const getAvailableGeminiModels = rankModelsByQuota

// Gọi Gemini Live API (hạn mức không giới hạn) qua WebSocket BidiGenerateContent
const callGeminiLiveBidi = ({ geminiKey, model, contents, systemPrompt = '', timeoutMs = 8500 }) => {
  if (typeof WebSocket !== 'function') {
    return Promise.resolve({ ok: false, status: 501, message: 'Runtime chưa hỗ trợ WebSocket.' })
  }

  return new Promise((resolve) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${geminiKey}`
    let ws
    let out = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws?.close()
      } catch (err) {
        // bỏ qua lỗi đóng socket
      }
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish(
        out.trim()
          ? { ok: true, text: out.trim(), model }
          : { ok: false, status: 504, message: `Quá thời gian chờ ${model}` }
      )
    }, timeoutMs)

    try {
      ws = new WebSocket(url)
    } catch (err) {
      return finish({ ok: false, status: 502, message: err instanceof Error ? err.message : String(err) })
    }

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${model}`,
            ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
            generationConfig: { responseModalities: ['AUDIO'] },
            outputAudioTranscription: {},
          },
        })
      )
    }

    ws.onmessage = async (ev) => {
      try {
        const raw = typeof ev.data === 'string' ? ev.data : Buffer.from(await ev.data.arrayBuffer()).toString('utf8')
        const msg = JSON.parse(raw)
        if (msg.setupComplete) {
          ws.send(JSON.stringify({ clientContent: { turns: contents, turnComplete: true } }))
        }
        if (msg?.serverContent?.outputTranscription?.text) {
          out += msg.serverContent.outputTranscription.text
        }
        if (msg?.serverContent?.turnComplete) {
          finish(
            out.trim()
              ? { ok: true, text: out.trim(), model }
              : { ok: false, status: 502, message: `${model} trả về rỗng.` }
          )
        }
      } catch (err) {
        // bỏ qua gói tin lỗi
      }
    }

    ws.onerror = () => finish({ ok: false, status: 502, message: `Lỗi WebSocket ${model}` })
    ws.onclose = (e) => {
      if (!settled) {
        finish(
          out.trim()
            ? { ok: true, text: out.trim(), model }
            : { ok: false, status: 502, message: `Đóng kết nối ${model} (${e.code}): ${e.reason || ''}` }
        )
      }
    }
  })
}

// Gọi Gemini -> Gemma -> Gemini Live: luôn ưu tiên bản còn nhiều lượt nhất trong từng nhóm, hết cả nhóm mới sang nhóm/hãng mới
const callGeminiTextOrVision = async ({
  geminiKey,
  contents,
  systemPrompt = '',
  temperature = 0.5,
  maxOutputTokens = 1000,
  withSearch = false,
  allowGemma = false,
  timeoutMs = 8000,
}) => {
  if (!geminiKey) return { ok: false, status: 503, message: 'Chưa cấu hình GEMINI_API_KEY.' }

  // Nhóm 1 (Gemini REST 11 bản) -> Nhóm 2 (Gemma 14.4K RPD nếu allowGemma)
  const restGroups = allowGemma ? [GEMINI_VISION_TEXT_MODELS, GEMINI_GEMMA_MODELS] : [GEMINI_VISION_TEXT_MODELS]
  let lastError = { status: 503, message: 'Gemini API đang bận.' }
  let authBlocked = false

  for (const group of restGroups) {
    const models = rankModelsByQuota(group)
    for (const model of models) {
      const isGemma = model.startsWith('gemma-')
      const reqContents = contents.map((c) => ({
        role: c.role,
        parts: c.parts.map((p) => ({ ...p })),
      }))

      // Dòng Gemma không hỗ trợ systemInstruction riêng hoặc google_search tool
      if (isGemma && systemPrompt && reqContents.length > 0) {
        const firstTextPart = reqContents[0].parts.find((p) => typeof p.text === 'string')
        if (firstTextPart) {
          firstTextPart.text = `${systemPrompt}\n\n---\n${firstTextPart.text}`
        } else {
          reqContents[0].parts.unshift({ text: systemPrompt })
        }
      }

      const payload = {
        contents: reqContents,
        generationConfig: { temperature, maxOutputTokens },
        ...(!isGemma && systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
        ...(!isGemma && withSearch ? { tools: [{ google_search: {} }] } : {}),
      }

      try {
        const res = await timedFetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          timeoutMs
        )

        if (res.ok) {
          const data = await res.json().catch(() => ({}))
          const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim()
          if (text) {
            recordModelSuccess(model)
            return { ok: true, text, model }
          }
          lastError = { status: 502, message: `Gemini ${model} trả về rỗng.` }
        } else {
          const err = await res.json().catch(() => ({}))
          lastError = {
            status: res.status,
            message: err?.error?.message || `Gemini ${model} lỗi (${res.status}).`,
          }
          console.warn(`[gemini] ${model} failed (${res.status}): ${lastError.message.slice(0, 120)}`)
          if (res.status === 401 || res.status === 403) {
            authBlocked = true
            break
          }
          markModelExhausted(model, res.status, lastError.message)
        }
      } catch (err) {
        lastError = {
          status: 502,
          message: err instanceof Error ? (err.name === 'AbortError' ? `Quá thời gian chờ ${model}` : err.message) : String(err),
        }
      }
    }
    if (authBlocked) break
  }

  // Nhóm 3: khi tất cả các bản Gemini REST & Gemma hết lượt mới sang Gemini Live (0 / Illimité)
  if (!authBlocked) {
    for (const liveModel of rankModelsByQuota(GEMINI_LIVE_MODELS)) {
      const liveRes = await callGeminiLiveBidi({
        geminiKey,
        model: liveModel,
        contents,
        systemPrompt,
        timeoutMs: Math.max(timeoutMs, 8500),
      })
      if (liveRes.ok) {
        recordModelSuccess(liveModel)
        return liveRes
      }
      lastError = { status: liveRes.status || 502, message: liveRes.message }
      markModelExhausted(liveModel, liveRes.status || 502, liveRes.message)
    }
  }

  return { ok: false, ...lastError }
}

// Nhìn ảnh dùng chung: xoay vòng các model Gemini Vision -> fallback Cloudflare LLaVA Vision
const inspectImageWithVision = async ({ mimeType = 'image/jpeg', base64, prompt, keys, maxTokens = 160 }) => {
  if (!base64) return ''

  if (keys.geminiKey) {
    const gRes = await callGeminiTextOrVision({
      geminiKey: keys.geminiKey,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }],
        },
      ],
      temperature: 0.2,
      maxOutputTokens: Math.max(maxTokens, 180),
      timeoutMs: 6500,
    })
    if (gRes.ok && gRes.text) return gRes.text
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
  MODEL_SPECS,
  GEMINI_VISION_TEXT_MODELS,
  GEMINI_GEMMA_MODELS,
  GEMINI_CHAT_MODELS,
  GEMINI_IMAGE_MODELS,
  GEMINI_LIVE_MODELS,
  recordModelSuccess,
  markModelExhausted,
  rankModelsByQuota,
  getAvailableGeminiModels,
  callGeminiLiveBidi,
  callGeminiTextOrVision,
  callCloudflareChat,
  inspectImageWithVision,
}
