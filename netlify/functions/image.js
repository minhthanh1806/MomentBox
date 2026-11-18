const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
}
const { guard } = require('../lib/guard')

const reply = (statusCode, payload) => ({
  statusCode,
  headers: jsonHeaders,
  body: JSON.stringify(payload),
})

// Luật prompt standee Momentbox (đồng bộ với README.md)
const STANDEE_RULES = [
  'Create ONE product image of a cute chibi paper standee gift box (Momentbox style).',
  'RULES:',
  '- Exactly one standee, centered, front view slightly angled 15-20 degrees.',
  '- The standee is a die-cut thick cardboard figure with a thick white border (3-5mm) and a folded stand base at the back.',
  '- It stands inside an open gift box with a layered 3D paper diorama background matching the theme.',
  '- Matte printed paper texture, clean cute chibi illustration style, pastel warm palette unless the customer asks for other colors.',
  '- Soft studio softbox lighting, gentle shadow under the base, clean cream or soft gradient background.',
  '- Square 1:1 composition, ultra detailed, sharp focus.',
  '- NO watermark, NO logo, NO random text, NO extra limbs, NO deformed face, NO multiple standees, NO messy background, NO realistic human photo, NO blurry or cropped figure.',
  '- Keep the character recognizable: preserve signature hair, outfit colors and accessories from the request/research, only simplified into cute chibi proportions (big head, small body).',
  '- If the customer asked for specific colors, props or text, follow them exactly; otherwise use the occasion style below.',
  'CUSTOMER REQUEST (follow it for characters, occasion, outfit, colors, props; may be in Vietnamese):',
].join('\n')

// Bước 1: nhận diện nhân vật khách nhắc tới và mô tả ngoại hình để ảnh đúng nhân vật
const CHARACTER_RESEARCH_RULES = [
  'You are the research step of a standee image generator.',
  'Read the customer requests (Vietnamese or English; the latest overrides earlier ones).',
  'RULES:',
  '1. If the customer names ANY existing character (game, anime, movie, TV, comic, cartoon, e.g. "Leon Kennedy"), you MUST search the web first, identify exactly who they are (name, franchise, which version/game/season if relevant), and report their real, recognizable look: hair color/style, eye color, face traits (scars, glasses, etc.), signature outfit and colors, accessories, weapons/props, typical pose. Never invent features that contradict the source.',
  '2. If the name is ambiguous, pick the most famous character and say which one in the first line.',
  '3. If the customer names a real person (celebrity or private), do NOT reproduce their face; describe only generic outfit/style and a stylized cartoon chibi.',
  '4. If no named character, just translate the request into English (characters, outfit, occasion, colors, props).',
  '5. Always convert the look into a CHIBI cute version (big head, small body) suitable for a paper standee, but KEEP the signature features (hair, outfit colors, accessories) so fans recognize the character at a glance.',
  '6. Output plain English, max 90 words, no markdown. First line format: "Character: <name or none> (<franchise>)". Then the visual description on the next line, starting with the most recognizable features.',
].join('\n')

// Phong cách riêng theo dịp (tự nhận diện từ lời khách)
const OCCASIONS = [
  { re: /(cưới|wedding|cô dâu|chú rể|bride|groom)/i, style: 'wedding theme: white gown and suit, flower arch, hearts, balloons, white and blush pink palette' },
  { re: /(valentine|người yêu|bạn gái|bạn trai|tình yêu|kỷ niệm yêu|couple|cầu hôn)/i, style: 'romantic couple theme: holding hands, roses, love letter, hearts, red and pink palette' },
  { re: /(sinh nhật|birthday)/i, style: 'birthday theme: birthday cake with candles, confetti, party hat, balloons, yellow and pastel blue palette' },
  { re: /(tốt nghiệp|sinh viên|kỷ yếu|graduat|cử nhân|học sinh)/i, style: 'graduation theme: graduation gown and cap, diploma, flowers, books, school badge, navy blue and gold palette' },
  { re: /(gia đình|family|bố mẹ|ba mẹ|con cái)/i, style: 'family theme: cozy small house, family photo frames, warm beige palette' },
  { re: /(doanh nghiệp|công ty|tri ân|sự kiện|company|corporate)/i, style: 'corporate theme: clean elegant scene, gift ribbon, brand-neutral colors, professional look' },
]

const occasionStyle = (requests) => {
  const text = requests.join(' ')
  const found = OCCASIONS.find((o) => o.re.test(text))
  return found ? found.style : ''
}

const cleanRequests = (messages) => {
  if (!Array.isArray(messages)) return []
  return messages
    .filter((m) => m && m.role === 'user' && typeof m.content === 'string' && m.content.trim())
    .slice(-4)
    .map((m) => m.content.trim().slice(0, 600))
}

const isGeminiKey = (k) => !!k && (k.startsWith('AIzaSy') || k.startsWith('AQ.'))

// fetch có giới hạn thời gian để không treo khi chuyển sang dịch vụ khác
const timedFetch = async (url, options = {}, ms = 15000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const errorFrom = async (res, fallbackMessage) => {
  const err = await res.json().catch(() => ({}))
  const msg = err?.error?.message || err?.errors?.[0]?.message || err?.error || fallbackMessage
  return `${fallbackMessage} (${res.status}): ${String(msg).slice(0, 160)}`
}

const researchCharacter = async (requests, textKey) => {
  if (!textKey) return null
  const text =
    CHARACTER_RESEARCH_RULES +
    '\nCUSTOMER REQUESTS:\n' +
    requests.map((r, i) => `${i + 1}. ${r}`).join('\n')

  const call = async (withSearch) => {
    const res = await timedFetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${textKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text }] }],
          ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
        }),
      },
      12000
    )
    if (!res.ok) return null
    const data = await res.json()
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim() || null
  }

  // Tổng thời gian cho bước tra cứu tối đa ~8 giây để còn thời gian tạo ảnh
  const withSearch = Date.now()
  try {
    const first = await Promise.race([
      call(true),
      new Promise((resolve) => setTimeout(() => resolve('__timeout__'), 8000)),
    ])
    if (first === '__timeout__') return null
    if (first) return first
    if (Date.now() - withSearch > 5000) return null
    return await call(false)
  } catch (err) {
    return null
  }
}

/* ---------------- Các nhà cung cấp ảnh (thử lần lượt) ---------------- */

const extractGeminiImage = (data) => {
  const parts = data?.candidates?.[0]?.content?.parts || []
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data
    if (inline?.data) {
      return { mimeType: inline.mimeType || inline.mime_type || 'image/png', data: inline.data }
    }
  }
  return null
}

// Prompt ngắn dạng tiếng Anh cho các model không hiểu luật dài
const shortPrompt = (requests, research) => {
  // Mô tả nhân vật (đã tra cứu) đặt lên đầu để model ưu tiên đúng ngoại hình
  const subject = (research || requests.join('. ')).replace(/\s+/g, ' ').replace(/^Character:\s*/i, '').slice(0, 600)
  const occasion = occasionStyle(requests)
  return `${subject}. ${occasion ? occasion + '. ' : ''}Drawn as a cute chibi paper standee, die-cut cardboard figure with thick white border and folded stand base, standing inside an open gift box with layered 3D paper diorama, matte paper texture, soft studio lighting, clean cream background, centered, single standee, product photo, highly detailed, no text, no watermark`
}

const buildProviders = ({ requests, research, fullPrompt }) => {
  const geminiKey = [process.env.GEMINI_API_KEY, process.env.OPENAI_API_KEY].find(isGeminiKey)
  const openaiKey = [process.env.OPENAI_API_KEY, process.env.GEMINI_API_KEY].find(
    (k) => k && !isGeminiKey(k)
  )
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID
  const cfToken = process.env.CLOUDFLARE_API_TOKEN
  const hfToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY
  const short = shortPrompt(requests, research)
  const providers = []

  if (geminiKey) {
    providers.push({
      name: 'Gemini',
      run: async () => {
        const models = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'gemini-3-pro-image-preview']
        let lastMessage = 'Gemini không trả về ảnh.'
        for (const model of models) {
          const res = await timedFetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
              }),
            }
          )
          if (!res.ok) {
            lastMessage = await errorFrom(res, `Gemini ${model}`)
            // Hết quota/không được phép: các model ảnh khác của Gemini cũng sẽ lỗi, chuyển nhà cung cấp luôn
            if (res.status === 429 || res.status === 403 || res.status === 401) break
            continue
          }
          const image = extractGeminiImage(await res.json())
          if (image) return image
        }
        throw new Error(lastMessage)
      },
    })
  }

  if (openaiKey) {
    providers.push({
      name: 'OpenAI',
      run: async () => {
        const res = await timedFetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({ model: 'gpt-image-1', prompt: fullPrompt, size: '1024x1024', n: 1 }),
        })
        if (!res.ok) throw new Error(await errorFrom(res, 'OpenAI'))
        const b64 = (await res.json())?.data?.[0]?.b64_json
        if (!b64) throw new Error('OpenAI không trả về ảnh.')
        return { mimeType: 'image/png', data: b64 }
      },
    })
  }

  if (cfAccount && cfToken) {
    providers.push({
      name: 'Cloudflare',
      run: async () => {
        const res = await timedFetch(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfToken}` },
            body: JSON.stringify({ prompt: short.slice(0, 2000), steps: 4 }),
          }
        )
        if (!res.ok) throw new Error(await errorFrom(res, 'Cloudflare'))
        const b64 = (await res.json())?.result?.image
        if (!b64) throw new Error('Cloudflare không trả về ảnh.')
        return { mimeType: 'image/jpeg', data: b64 }
      },
    })
  }

  if (hfToken) {
    providers.push({
      name: 'HuggingFace',
      run: async () => {
        const res = await timedFetch(
          'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hfToken}` },
            body: JSON.stringify({ inputs: short }),
          }
        )
        if (!res.ok) throw new Error(await errorFrom(res, 'HuggingFace'))
        const type = res.headers.get('content-type') || ''
        if (!type.startsWith('image/')) throw new Error('HuggingFace không trả về ảnh.')
        return { mimeType: type, data: Buffer.from(await res.arrayBuffer()).toString('base64') }
      },
    })
  }

  // Cuối cùng: Pollinations (không cần key, nhưng có thể đòi trả phí)
  providers.push({
    name: 'Pollinations',
    run: async () => {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(short)}?width=1024&height=1024&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1000000)}`
      const res = await timedFetch(url)
      if (!res.ok) throw new Error(`Pollinations (${res.status})`)
      const type = res.headers.get('content-type') || ''
      if (!type.startsWith('image/')) throw new Error('Pollinations không trả về ảnh.')
      return { mimeType: type, data: Buffer.from(await res.arrayBuffer()).toString('base64') }
    },
  })

  return providers
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' })

  // Tạo ảnh tốn tiền/quota nên giới hạn chặt: 5 ảnh / 10 phút / người
  const blocked = guard(event, { name: 'image', limit: 5, windowMs: 10 * 60 * 1000 })
  if (blocked) return blocked

  let body
  try {
    body = JSON.parse(event.body)
  } catch (err) {
    return reply(400, { error: 'Dữ liệu gửi lên không hợp lệ.' })
  }

  const requests = cleanRequests(body.messages)
  if (!requests.length) return reply(400, { error: 'Vui lòng mô tả standee bạn muốn tạo.' })

  const textKey = [process.env.GEMINI_API_KEY, process.env.OPENAI_API_KEY].find(isGeminiKey) || ''
  const research = await researchCharacter(requests, textKey)

  const fullPrompt = `${STANDEE_RULES}\n${requests.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n(If several requests are listed, the latest one refines the earlier ones.)${
    occasionStyle(requests) ? `\nOCCASION STYLE (use unless the customer specified otherwise): ${occasionStyle(requests)}` : ''
  }${
    research ? `\nCHARACTER RESEARCH (use this exact look, keep it recognizable but chibi):\n${research}` : ''
  }`

  const providers = buildProviders({ requests, research, fullPrompt })
  const failures = []

  // Thử lần lượt: nhà cung cấp nào hết lượt/lỗi thì chuyển sang nhà tiếp theo
  for (const provider of providers) {
    try {
      const image = await provider.run()
      return reply(200, { image, provider: provider.name })
    } catch (err) {
      const message = err instanceof Error ? (err.name === 'AbortError' ? 'quá thời gian chờ' : err.message) : String(err)
      console.warn(`[image] ${provider.name} failed: ${message}`)
      failures.push(`${provider.name}: ${message}`)
    }
  }

  return reply(503, {
    error:
      'Tất cả dịch vụ tạo ảnh đều đang hết lượt hoặc lỗi. Vui lòng thử lại sau hoặc bật billing/thêm key (xem README). Chi tiết: ' +
      failures.join(' | ').slice(0, 500),
  })
}
