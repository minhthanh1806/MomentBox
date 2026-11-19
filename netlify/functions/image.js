const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
}
const { guard } = require('../lib/guard')
const { getKeys, timedFetch, callCloudflareChat, inspectImageWithVision } = require('../lib/ai-keys')
const { matchKnownCharacter } = require('../lib/characters')
const { lookupCharacterOnline } = require('../lib/character-search')

const reply = (statusCode, payload) => ({
  statusCode,
  headers: jsonHeaders,
  body: JSON.stringify(payload),
})

// Phong cách: MẶC ĐỊNH vẽ tỉ lệ bình thường. CHỈ vẽ chibi khi khách yêu cầu chibi
// Kiểm tra theo thứ tự tin nhắn để khách có thể bật/tắt chibi khi tinh chỉnh ảnh
const wantsChibi = (requests) => {
  let chibi = false
  for (const raw of requests) {
    const t = raw.toLowerCase()
    if (/(không\s*chibi|ko\s*chibi|bỏ\s*chibi|đừng\s*chibi|hết\s*chibi|no\s*chibi|not\s*chibi|bình\s*thường|tỉ\s*lệ\s*(thật|người|bình\s*thường)|người\s*thật)/i.test(t)) {
      chibi = false
    } else if (/(chibi|q[- ]?version|đầu\s*to\s*dễ\s*thương)/i.test(t)) {
      chibi = true
    }
  }
  return chibi
}

// Phong cách riêng theo dịp & chủ đề (tự nhận diện từ lời khách)
const OCCASIONS = [
  { re: /(cưới|wedding|cô dâu|chú rể|bride|groom)/i, style: 'wedding theme: floral paper arch, subtle hearts, ivory white and blush pink 3D paper layers' },
  { re: /(valentine|người yêu|bạn gái|bạn trai|tình yêu|kỷ niệm|couple|cầu hôn|anniversary)/i, style: 'romantic anniversary theme: miniature roses, love letter envelopes, heart cutouts, soft crimson and pastel pink 3D diorama layers' },
  { re: /(sinh nhật|birthday)/i, style: 'birthday celebration theme: miniature tiered birthday cake with candles, paper confetti, gift ribbons, warm yellow and pastel sky-blue 3D paper layers' },
  { re: /(tốt nghiệp|sinh viên|kỷ yếu|graduat|cử nhân|học sinh)/i, style: 'graduation theme: rolled diploma, bouquet of sunflowers, stacked books, mortarboard silhouettes, navy blue and warm gold 3D paper layers' },
  { re: /(áo dài|sen|truyền thống|tết|cổ phục|việt nam|nón lá)/i, style: 'Vietnamese heritage theme: lotus flower cutouts, delicate bamboo leaves, traditional lantern accents, ivory-cream and jade-pastel 3D paper layers' },
  { re: /(gia đình|family|bố mẹ|ba mẹ|con cái)/i, style: 'warm family theme: cozy miniature house silhouette, tiny photo frames, warm cream and sage pastel 3D paper layers' },
  { re: /(doanh nghiệp|công ty|tri ân|sự kiện|company|corporate)/i, style: 'corporate gifting theme: sleek minimal geometric stage, subtle ribbon accent, clean ivory and sage navy 3D paper layers' },
  { re: /(bóng đá|thể thao|guitar|âm nhạc|ca sĩ|nhạc|sport|music)/i, style: 'music and passion theme: stylized stage spotlight cutouts, musical notes or star silhouettes, vibrant pastel 3D paper layers' },
  { re: /(anime|manga|hoạt hình|phim|movie|game)/i, style: 'layered anime-collectible diorama stage with dramatic paper archways, floating sparkle cutouts, and dynamic atmospheric 3D paper layers' },
]

const DEFAULT_DIORAMA =
  'signature MomentBox diorama stage with layered 3D paper arch frame, delicate miniature paper flowers, subtle floating star and heart cutouts, and warm pastel paper layers'

const pickSceneTheme = (requests, knownChar) => {
  const text = requests.join(' ')
  const found = OCCASIONS.find((o) => o.re.test(text))
  if (found) return found.style
  if (knownChar?.sceneTheme) return knownChar.sceneTheme
  return DEFAULT_DIORAMA
}

// Bắt yêu cầu đổi màu hộp / tone màu mới nhất của khách (vd: "đổi hộp sang màu xanh mint")
const extractBoxColorOverride = (requests) => {
  const colorRules = [
    { re: /(xanh\s*mint|bạc\s*hà|mint)/i, hint: 'pastel mint-green gift box' },
    { re: /(xanh\s*navy|xanh\s*dương\s*đậm|navy)/i, hint: 'deep navy-blue gift box' },
    { re: /(xanh\s*dương|xanh\s*pastel|sky\s*blue|màu\s*xanh(?!\s*lá))/i, hint: 'soft pastel sky-blue gift box' },
    { re: /(xanh\s*lá|green|rừng)/i, hint: 'soft sage-green gift box' },
    { re: /(hồng|pink|phấn)/i, hint: 'soft blush-pink gift box' },
    { re: /(tím|lavender|purple)/i, hint: 'pastel lavender-purple gift box' },
    { re: /(vàng|gold|nắng)/i, hint: 'warm pastel butter-yellow gift box' },
    { re: /(đỏ|crimson|red)/i, hint: 'warm crimson and cream gift box' },
    { re: /(đen|black|ngầu|tối)/i, hint: 'sleek matte charcoal-black and cream gift box' },
  ]
  for (let i = requests.length - 1; i >= 0; i--) {
    const matched = colorRules.find((c) => c.re.test(requests[i]))
    if (matched) return matched.hint
  }
  return 'open pastel luxury presentation gift box'
}

const cleanRequests = (messages) => {
  if (!Array.isArray(messages)) return []
  return messages
    .filter((m) => m && m.role === 'user' && typeof m.content === 'string' && m.content.trim())
    .slice(-5)
    .map((m) => m.content.trim().slice(0, 600))
}

// Trích xuất trí nhớ chủ thể từ lượt tạo ảnh trước đó (giữ ngoại hình ảnh upload khi chỉnh sửa nối tiếp)
const extractPreviousSubject = (messages, explicitSummary) => {
  if (typeof explicitSummary === 'string' && explicitSummary.trim()) {
    return explicitSummary.trim().slice(0, 500)
  }
  if (!Array.isArray(messages)) return ''
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role === 'assistant' && typeof m.content === 'string') {
      const match = m.content.match(/Chủ thể:\s*([^)]+)\)?/i)
      if (match && match[1]) return match[1].trim().slice(0, 500)
    }
  }
  return ''
}

const errorFrom = async (res, fallbackMessage) => {
  const err = await res.json().catch(() => ({}))
  const msg = err?.error?.message || err?.errors?.[0]?.message || err?.error || fallbackMessage
  return `${fallbackMessage} (${res.status}): ${String(msg).slice(0, 160)}`
}

// Luật prompt standee đầy đủ (cho Gemini / OpenAI image)
const standeeRules = (chibi, hasReference) =>
  [
    chibi
      ? 'Create ONE studio product photograph of a cute CHIBI paper standee gift box (MomentBox style).'
      : 'Create ONE studio product photograph of a natural-proportion illustrated paper standee gift box (MomentBox style). Do NOT use chibi or oversized-head cartoon proportions.',
    'STRICT PRODUCT & COMPOSITION RULES:',
    '- Exactly ONE flat 2D printed die-cut standee cutout (featuring 1 character or the requested couple), centered, front view slightly angled 15-20 degrees.',
    '- Prominent thick 3-5mm white die-cut outline border around the entire character silhouette, mounted upright on a visible stand base.',
    '- Placed upright inside an open luxury presentation gift box containing a multi-layered 3D paper diorama stage matching the theme.',
    chibi
      ? '- Art style: cute stylized CHIBI illustration (adorable big head, compact small body), matte printed paper texture.'
      : '- Art style: clean polished illustration with NATURAL 1:7 human head-to-body proportions, matte printed paper texture.',
    '- Soft studio softbox lighting, gentle shadow, clean warm light-cream studio backdrop.',
    '- Square 1:1 product shot, sharp focus, ultra detailed.',
    chibi
      ? '- NO watermark, NO random text/letters, NO extra limbs, NO deformed face, NO multiple separate standees.'
      : '- NO chibi, NO big-head bobblehead proportions, NO watermark, NO random text/letters, NO extra limbs, NO deformed face, NO multiple separate standees.',
    '- Preserve signature hair, facial expression, clothing, colors, and props accurately.',
    hasReference
      ? '- Reflect the customer reference photo/subject description faithfully in the standee artwork.'
      : '',
    'CUSTOMER REQUEST:',
  ]
    .filter(Boolean)
    .join('\n')

// Bước 1A: Nhìn ảnh upload của khách (dùng chung Vision helper: Gemini Vision -> Cloudflare LLaVA)
const describeReferenceImage = async (reference, keys) => {
  if (!reference) return ''
  const visionPrompt =
    'Focus ONLY on the main foreground person or couple in this photo for a custom portrait standee. State exact count of main subjects (1 or 2), gender, hair style & color, glasses, exact shirt/dress/jacket style & colors, and pose. Ignore background pictures or small decorations. Max 55 words in 1 plain English sentence. Do not name anyone.'
  return inspectImageWithVision({
    mimeType: reference.mimeType,
    base64: reference.data,
    prompt: visionPrompt,
    keys,
    maxTokens: 160,
  })
}

// Bước 1B: Tổng hợp nghiên cứu nhân vật & viết mô tả hình ảnh tiếng Anh chuẩn xác
const buildResearchInstruction = (chibi, hasReference, hasPreviousSubject) =>
  [
    'You are an expert prompt engineer and character researcher for MomentBox 3D standee gift boxes.',
    'Analyze the customer requests ordered oldest to newest; the latest request modifies/overrides earlier outfit, color, or style details.',
    'STRICT RULES:',
    '1. If a fictional character (game, anime, movie, TV, comic) is named—even with typos (e.g. "Leon Kenedy", "Lufy")—identify the exact character and use the CHARACTER REFERENCE provided or your exact knowledge of their iconic hair, eyes, signature outfit, colors, and pose.',
    '2. If a real celebrity is named without a photo, describe only a generic stylized outfit/vibe—never clone a celebrity face.',
    hasReference
      ? '3. Use the UPLOADED CUSTOMER PHOTO DESCRIPTION to keep the exact people, outfits, hair, glasses, and pose faithfully, applying only changes requested in the latest message.'
      : hasPreviousSubject
        ? '3. The customer is refining a PREVIOUSLY GENERATED STANDY SUBJECT: KEEP the exact same person/couple/character from PREVIOUS SUBJECT MEMORY (hair, glasses, count of people, core appearance) and ONLY apply the new edits from the latest request (such as outfit change, props, or chibi/normal switch).'
        : '3. Translate all requested outfits, characters, age, gender, colors, props, and mood from Vietnamese to vivid visual English.',
    chibi
      ? '4. STYLE MANDATE: The customer explicitly requested CHIBI. Describe them in cute CHIBI proportions (adorable big head, tiny compact body, cute kawaii eyes) while preserving every iconic hair, outfit, and accessory trait.'
      : '4. STYLE MANDATE: The customer did NOT request chibi. Describe tall, slender ADULT proportions (realistic 1:7 head-to-body ratio, small proportional head, long legs, sleek anime/editorial art style). NEVER write "chibi", "cartoonish", or "big head".',
    '5. SAFETY RULE FOR IMAGE GENERATOR: Avoid sensitive weapon/violence words (never write gun, rifle, shotgun, pistol, firearm, knife, sword, katana, blade, bullet, ammo, grenade, weapon, blood, kill, dead, zombie, horror). For action characters, substitute with "tactical flashlight", "utility belt", "ceremonial staff", "police badge", or "confident action pose".',
    '6. Output ONLY ONE single plain English visual description paragraph (max 70 words, no labels, no bullet points, no markdown, no "standee/gift box" wording—focus purely on the character(s), clothing, pose, props, and color palette).',
  ].join('\n')

// Dịch mô tả tiếng Việt sang tiếng Anh miễn phí khi các LLM đều hết lượt (429)
const translateViToEnFallback = async (requests) => {
  const cleaned = requests
    .map((r) =>
      r
        .replace(/^(tạo|vẽ|gen|render|làm|thiết kế)(\s+(cho\s+mình|giúp\s+mình|thử))?(\s+(ảnh|hình|mẫu|standee))*/gi, '')
        .trim()
    )
    .filter(Boolean)
    .join('. ')
    .slice(0, 420)

  if (!cleaned) return ''
  try {
    const res = await timedFetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleaned)}&langpair=vi|en`,
      {},
      3800
    )
    if (!res.ok) return cleaned
    const data = await res.json().catch(() => ({}))
    const translated = data?.responseData?.translatedText?.trim()
    if (!translated || /MYMEMORY WARNING/i.test(translated)) return cleaned
    return translated
  } catch (err) {
    return cleaned
  }
}

const researchAndCraftSubject = async ({ requests, chibi, photoDesc, previousSubject, onlineLookup, keys }) => {
  const instruction = buildResearchInstruction(chibi, !!photoDesc, !!previousSubject)
  const webBio = onlineLookup?.found
    ? [
        onlineLookup.characterName ? `Character: ${onlineLookup.characterName}${onlineLookup.franchise ? ` (${onlineLookup.franchise})` : ''}` : '',
        onlineLookup.bio ? `Bio: ${onlineLookup.bio}` : '',
        onlineLookup.visualInspection ? `Direct Visual Observation from Online Image: ${onlineLookup.visualInspection}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  const userPayload = [
    'CUSTOMER REQUESTS (oldest to newest):',
    ...requests.map((r, i) => `${i + 1}. ${r}`),
    webBio ? `\nONLINE CHARACTER RESEARCH & IMAGE INSPECTION:\n${webBio}` : '',
    photoDesc ? `\nUPLOADED CUSTOMER PHOTO DESCRIPTION:\n${photoDesc}` : '',
    !photoDesc && previousSubject ? `\nPREVIOUS SUBJECT MEMORY (preserve unless overridden by newest request):\n${previousSubject}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  if (keys.geminiKey) {
    const callGemini = async (withSearch) => {
      const res = await timedFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${keys.geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${instruction}\n\n${userPayload}` }] }],
            ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
            generationConfig: { temperature: 0.25, maxOutputTokens: 250 },
          }),
        },
        6000
      )
      if (!res.ok) return { ok: false, status: res.status }
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim()
      return text ? { ok: true, text } : { ok: false, status: 502 }
    }

    try {
      const first = await callGemini(true)
      if (first.ok) return first.text
      if (first.status !== 429 && first.status !== 401 && first.status !== 403) {
        const second = await callGemini(false)
        if (second.ok) return second.text
      }
    } catch (err) {
      // chuyển sang Cloudflare LLM
    }
  }

  if (keys.cfAccount && keys.cfToken) {
    const res = await callCloudflareChat({
      cfAccount: keys.cfAccount,
      cfToken: keys.cfToken,
      systemPrompt: instruction,
      messages: [{ role: 'user', content: userPayload }],
      temperature: 0.25,
      maxTokens: 190,
      timeoutMs: 9000,
    })
    if (res.ok && res.text) return res.text
  }

  if (photoDesc) return photoDesc
  const translatedReq = await translateViToEnFallback(requests)
  if (onlineLookup?.found) {
    const hasFranchise =
      onlineLookup.franchise &&
      onlineLookup.characterName.toLowerCase().includes(onlineLookup.franchise.toLowerCase())
    const label = `${onlineLookup.characterName}${onlineLookup.franchise && !hasFranchise ? ` from ${onlineLookup.franchise}` : ''}`
    // Nếu có kết quả Vision nhìn ảnh thật thì dùng ngay; tránh nhét tiểu sử cốt truyện (chứa tên nhân vật khác) gây nhiễu FLUX
    if (onlineLookup.visualInspection) {
      return `${label}: ${onlineLookup.visualInspection.slice(0, 260)}`
    }
    const extra =
      translatedReq && !translatedReq.toLowerCase().includes(onlineLookup.characterName.split('(')[0].trim().toLowerCase())
        ? `, ${translatedReq}`
        : ''
    return `${label}, official canonical character appearance, iconic hairstyle and signature outfit${extra}`
  }
  return translatedReq || previousSubject || ''
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

// Làm sạch từ nhạy cảm để bộ lọc an toàn của FLUX không chặn nhân vật hành động
const sanitizeForImageSafety = (text) =>
  text
    .replace(/\b(shotgun|rifle|handgun|pistol|firearm|gun|guns|weapon|weapons)\b/gi, 'tactical flashlight')
    .replace(/\b(knife|knives|dagger|blade|sword|katana|chainsaw)\b/gi, 'ceremonial prop')
    .replace(/\b(bullet|bullets|ammo|ammunition|grenade)\b/gi, 'utility pouch')
    .replace(/\b(holster)\b/gi, 'utility belt')
    .replace(/\b(blood|bloody|gore|wound|kill|dead|assassin|zombie|horror)\b/gi, 'dramatic')

// Tạo prompt tối ưu cho FLUX / Diffusion (củng cố hiệu ứng die-cut viền trắng và hộp 3D giàu chi tiết)
const buildFluxPrompt = ({ requests, subjectDesc, sceneTheme, boxStyle, chibi }) => {
  let subject = (subjectDesc || requests.join('. '))
    .replace(/\s+/g, ' ')
    .replace(/^Character:\s*/i, '')
    .trim()
    .slice(0, 520)

  subject = sanitizeForImageSafety(subject)

  if (!chibi) {
    subject = subject.replace(/\b(chibi|kawaii|bobblehead|big[- ]head|oversized[- ]head)\b/gi, 'natural-proportion')
  }

  const hasGroup = /\b(couple|two people|two characters|beside a|next to a|man and woman|husband and wife|bride and groom|two)\b|cặp đôi|2 người|hai người|2 nhân vật|3 nhân vật/i.test(
    `${subject} ${requests.join(' ')}`
  )

  const styleLead = chibi
    ? `One flat 2D printed cardboard die-cut standee cutout with a prominent thick white outline border featuring ${hasGroup ? 'cute kawaii chibi characters standing side-by-side' : 'a cute kawaii chibi character'} (oversized round head, tiny compact body)`
    : `One flat 2D printed cardboard die-cut standee cutout with a prominent thick white outline border featuring ${hasGroup ? 'two full-body tall adult characters standing side-by-side' : 'a full-body tall adult character'} (slender 1:7 realistic human head-to-body ratio, small proportional head, long legs, sleek polished illustration)`

  return `${styleLead}: ${subject}. The paper standee cutout is mounted upright on a white standee base inside an ${boxStyle} featuring a ${sceneTheme}. Matte printed cardstock texture, bright soft daylight studio lighting, gentle shadows, clean warm light-cream studio backdrop, centered front product photography, sharp focus, no text, no watermark.`
}

// Dùng 768x768 & 4 steps giúp tạo ảnh trong 3-5 giây và tiết kiệm quota ZeroGPU
const GRADIO_SPACES = [
  { url: 'https://evalstate-flux1-schnell.hf.space', buildData: (p) => [p, 0, true, 768, 768, 4] },
  { url: 'https://black-forest-labs-flux-1-schnell.hf.space', buildData: (p) => [p, 0, true, 768, 768, 4] },
  { url: 'https://multimodalart-flux-1-merged.hf.space', buildData: (p) => [p, 0, true, 768, 768, 3.5, 4] },
]

// Gọi cụm Hugging Face Gradio Spaces FLUX.1 miễn phí không cần API key
const callGradioFlux = async (fluxPrompt) => {
  let lastMsg = 'Không kết nối được Gradio Space.'
  for (const space of GRADIO_SPACES) {
    try {
      const startRes = await timedFetch(
        `${space.url}/gradio_api/call/infer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: space.buildData(fluxPrompt) }),
        },
        8000
      )
      if (!startRes.ok) {
        lastMsg = `${space.url} (${startRes.status})`
        continue
      }
      const { event_id: eventId } = await startRes.json().catch(() => ({}))
      if (!eventId) {
        lastMsg = `${space.url} không trả về event_id`
        continue
      }

      const sseRes = await timedFetch(`${space.url}/gradio_api/call/infer/${eventId}`, {}, 22000)
      if (!sseRes.ok) {
        lastMsg = `${space.url} SSE (${sseRes.status})`
        continue
      }
      const sseText = await sseRes.text()
      const completeMatch = sseText.match(/event:\s*complete[\r\n]+data:\s*(\[[^\r\n]+\])/)
      if (!completeMatch) {
        lastMsg = `${space.url} không hoàn tất kịp`
        continue
      }
      const payload = JSON.parse(completeMatch[1])
      const fileObj = payload?.[0]
      const fileUrl = fileObj?.url || (fileObj?.path ? `${space.url}/gradio_api/file=${fileObj.path}` : '')
      if (!fileUrl) {
        lastMsg = `${space.url} thiếu URL ảnh`
        continue
      }

      const imgRes = await timedFetch(fileUrl, {}, 10000)
      if (!imgRes.ok) {
        lastMsg = `${space.url} tải ảnh (${imgRes.status})`
        continue
      }
      const mimeType = (imgRes.headers.get('content-type') || 'image/webp').split(';')[0].trim()
      if (!mimeType.startsWith('image/')) {
        lastMsg = `${space.url} sai định dạng ảnh`
        continue
      }
      return { mimeType, data: Buffer.from(await imgRes.arrayBuffer()).toString('base64') }
    } catch (err) {
      lastMsg = err instanceof Error ? (err.name === 'AbortError' ? 'quá thời gian chờ' : err.message) : String(err)
    }
  }
  throw new Error(`Gradio FLUX: ${lastMsg}`)
}

const buildProviders = ({ fluxPrompt, fullPrompt, reference, keys }) => {
  const providers = []

  if (keys.geminiKey) {
    providers.push({
      name: 'Gemini',
      run: async () => {
        const models = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview', 'gemini-3-pro-image-preview']
        let lastMessage = 'Gemini không trả về ảnh.'
        for (const model of models) {
          const res = await timedFetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys.geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    role: 'user',
                    parts: [
                      { text: fullPrompt },
                      ...(reference ? [{ inlineData: { mimeType: reference.mimeType, data: reference.data } }] : []),
                    ],
                  },
                ],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
              }),
            },
            14000
          )
          if (!res.ok) {
            lastMessage = await errorFrom(res, `Gemini ${model}`)
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

  if (keys.openaiKey) {
    providers.push({
      name: 'OpenAI',
      run: async () => {
        const res = await timedFetch(
          'https://api.openai.com/v1/images/generations',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.openaiKey}` },
            body: JSON.stringify({ model: 'gpt-image-1', prompt: fullPrompt, size: '1024x1024', n: 1 }),
          },
          20000
        )
        if (!res.ok) throw new Error(await errorFrom(res, 'OpenAI'))
        const b64 = (await res.json())?.data?.[0]?.b64_json
        if (!b64) throw new Error('OpenAI không trả về ảnh.')
        return { mimeType: 'image/png', data: b64 }
      },
    })
  }

  if (keys.cfAccount && keys.cfToken) {
    providers.push({
      name: 'Cloudflare',
      run: async () => {
        const res = await timedFetch(
          `https://api.cloudflare.com/client/v4/accounts/${keys.cfAccount}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.cfToken}` },
            body: JSON.stringify({ prompt: fluxPrompt.slice(0, 1900), steps: 6 }),
          },
          20000
        )
        if (!res.ok) throw new Error(await errorFrom(res, 'Cloudflare'))
        const b64 = (await res.json())?.result?.image
        if (!b64) throw new Error('Cloudflare không trả về ảnh.')
        return { mimeType: 'image/jpeg', data: b64 }
      },
    })
  }

  if (keys.hfToken) {
    providers.push({
      name: 'HuggingFace',
      run: async () => {
        const res = await timedFetch(
          'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.hfToken}` },
            body: JSON.stringify({ inputs: fluxPrompt }),
          },
          18000
        )
        if (!res.ok) throw new Error(await errorFrom(res, 'HuggingFace'))
        const type = res.headers.get('content-type') || ''
        if (!type.startsWith('image/')) throw new Error('HuggingFace không trả về ảnh.')
        return { mimeType: type, data: Buffer.from(await res.arrayBuffer()).toString('base64') }
      },
    })
  }

  providers.push({
    name: 'HuggingFace Space (FLUX.1)',
    run: () => callGradioFlux(fluxPrompt),
  })

  providers.push({
    name: 'Pollinations',
    run: async () => {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fluxPrompt)}?width=1024&height=1024&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1000000)}`
      const res = await timedFetch(url, {}, 15000)
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

  const blocked = guard(event, { name: 'image', limit: 5, windowMs: 10 * 60 * 1000, maxBodyBytes: 2_500_000 })
  if (blocked) return blocked

  let body
  try {
    body = JSON.parse(event.body)
  } catch (err) {
    return reply(400, { error: 'Dữ liệu gửi lên không hợp lệ.' })
  }

  let requests = cleanRequests(body.messages)

  let reference = null
  const img = body.image
  if (
    img &&
    typeof img.data === 'string' &&
    /^image\/(jpeg|png|webp)$/.test(img.mimeType || '') &&
    img.data.length < 2_000_000 &&
    /^[A-Za-z0-9+/=]+$/.test(img.data)
  ) {
    reference = { mimeType: img.mimeType, data: img.data }
  }
  if (!requests.length && reference) requests = ['Make a standee of the people in the attached photo.']
  if (!requests.length) return reply(400, { error: 'Vui lòng mô tả standee bạn muốn tạo.' })

  const keys = getKeys()
  const chibi = wantsChibi(requests)
  const knownChar = matchKnownCharacter(requests)
  const sceneTheme = pickSceneTheme(requests, knownChar)
  const boxStyle = extractBoxColorOverride(requests)
  const previousSubject = extractPreviousSubject(body.messages, body.previousSubject)

  const [onlineLookup, photoDesc] = await Promise.all([
    lookupCharacterOnline(requests, knownChar, keys, !!reference),
    describeReferenceImage(reference, keys),
  ])

  const subjectDesc = await researchAndCraftSubject({
    requests,
    chibi,
    photoDesc,
    previousSubject,
    onlineLookup,
    keys,
  })

  const fullPrompt = `${standeeRules(chibi, !!(reference || previousSubject))}\n${requests.map((r, i) => `${i + 1}. ${r}`).join('\n')}\nSCENE & BOX: ${boxStyle}, ${sceneTheme}${
    subjectDesc ? `\nSUBJECT VISUAL SPEC: ${subjectDesc}` : ''
  }`

  const fluxPrompt = buildFluxPrompt({ requests, subjectDesc, sceneTheme, boxStyle, chibi })
  const providers = buildProviders({ fluxPrompt, fullPrompt, reference, keys })
  const failures = []

  const webLookupMeta = onlineLookup?.found
    ? {
        characterName:
          onlineLookup.franchise && !String(onlineLookup.characterName).toLowerCase().includes(onlineLookup.franchise.toLowerCase())
            ? `${onlineLookup.characterName} (${onlineLookup.franchise})`
            : onlineLookup.characterName,
        imageUrl: onlineLookup.imageUrl || '',
        pageUrl: onlineLookup.pageUrl || '',
        source: onlineLookup.source || 'Wikipedia',
      }
    : null

  for (const provider of providers) {
    try {
      const image = await provider.run()
      return reply(200, {
        image,
        provider: provider.name,
        meta: {
          provider: provider.name,
          style: chibi ? 'chibi' : 'normal',
          character: webLookupMeta?.characterName || knownChar?.canonicalName || null,
          webLookup: webLookupMeta,
          summary: subjectDesc || previousSubject || requests[requests.length - 1],
        },
      })
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
