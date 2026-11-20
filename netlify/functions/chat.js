const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
}
const { guard } = require('../lib/guard')
const { CHAT_SYSTEM_PROMPT } = require('../lib/prompts')
const { getKeys, timedFetch, callGeminiTextOrVision, callCloudflareChat } = require('../lib/ai-keys')

const cleanMessages = (messages) => {
  if (!Array.isArray(messages)) return []

  return messages
    .filter((message) => {
      if (!message || typeof message !== 'object') return false
      return (
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0
      )
    })
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 900),
    }))
}

const okReply = (reply, provider) => ({
  statusCode: 200,
  headers: jsonHeaders,
  body: JSON.stringify({
    reply: reply || 'Mình chưa tạo được gợi ý lúc này. Bạn thử mô tả rõ hơn về dịp tặng nhé.',
    provider,
  }),
})

const tryGeminiChat = async (geminiKey, messages, systemPrompt) => {
  const geminiMessages = messages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }))
  if (geminiMessages.length > 0 && geminiMessages[0].role === 'model') {
    geminiMessages.shift()
  }

  const res = await callGeminiTextOrVision({
    geminiKey,
    contents: geminiMessages,
    systemPrompt,
    temperature: 0.65,
    maxOutputTokens: 1200,
    allowGemma: true,
    timeoutMs: 9000,
  })
  if (res.ok) return { ok: true, text: res.text, provider: `Gemini (${res.model})` }
  return res
}

const tryOpenAiChat = async (openaiKey, messages, systemPrompt) => {
  try {
    const response = await timedFetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: 0.65,
          max_tokens: 1000,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
      },
      12000
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        ok: false,
        status: response.status,
        message: errorData?.error?.message || 'OpenAI gặp sự cố.',
      }
    }

    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content?.trim()
    return text ? { ok: true, text, provider: 'OpenAI (gpt-4o-mini)' } : { ok: false, status: 502, message: 'OpenAI trả về rỗng.' }
  } catch (err) {
    return { ok: false, status: 502, message: err instanceof Error ? err.message : String(err) }
  }
}

// Bộ tư vấn dự phòng thông minh trên server khi tất cả LLM đều hết lượt (429)
const buildSmartAdvisorReply = (messages) => {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || ''
  const t = lastUser.toLowerCase()

  if (/(bỏ qua|ignore|viết code|python|javascript|làm toán|giải phương trình|jailbreak)/i.test(t)) {
    return 'Xin lỗi, mình chỉ hỗ trợ tư vấn thiết kế hộp quà standee 3D của MomentBox. Bạn cần gợi ý concept quà tặng cho dịp nào để mình hỗ trợ nhé?'
  }
  if (/(ship|vận chuyển|giao hàng|mấy ngày|bao lâu|địa chỉ|ở đâu|đổi trả|giảm giá|khuyến mãi)/i.test(t)) {
    return 'Để biết chính xác phí ship, thời gian giao hàng hoặc ưu đãi hiện tại, bạn vui lòng nhắn trực tiếp qua Zalo **0983806933** để nhân viên MomentBox xác nhận nhanh cho bạn nhé.'
  }
  if (/(viết prompt|prompt tiếng anh|tạo prompt)/i.test(t)) {
    return (
      'Bạn có thể dùng mẫu prompt tiếng Anh sau (tỉ lệ tự nhiên 1:7, nền kem sạch):\n\n' +
      '```text\n' +
      'One die-cut cardboard standee cutout of a couple in natural 1:7 human proportions, crisp white die-cut border and stand base, standing upright inside an open pastel luxury gift box with a 3D layered paper diorama stage, soft studio softbox lighting, clean cream backdrop, centered product shot, 1:1. Negative prompt: text, watermark, logo, extra limbs, deformed face, blurry, multiple standees, messy background, realistic human photo.\n' +
      '```\n\n' +
      'Lưu ý ảnh AI chỉ để tham khảo ý tưởng, bản thiết kế chính thức sẽ được MomentBox vẽ tỉ mỉ từ ảnh thật bạn gửi qua Zalo **0983806933**.'
    )
  }
  if (/(250k|sinh viên|tiết kiệm|giá rẻ|1 nhân vật|lite)/i.test(t)) {
    return (
      'Với ngân sách 250K, gói **Lite Box (250K)** là lựa chọn phù hợp nhất cho bạn:\n' +
      '- **Chi tiết gói:** 1 nhân vật standee 3D sắc nét, 1 concept màu chủ đạo và thiệp chúc mừng cá nhân hóa.\n' +
      '- **Gợi ý:** Bạn có thể nhắn ngay `"Tạo ảnh standee..."` hoặc bấm nút 🖼 bên trái ô nhập để xem trước mẫu, rồi gửi ảnh thật qua Zalo **0983806933** để lên demo 3D nhé.'
    )
  }
  if (/(700k|doanh nghiệp|công ty|sự kiện|số lượng|cưới|premium)/i.test(t)) {
    return (
      'Với nhu cầu cao cấp hoặc sự kiện, gói **Premium Scene (700K)** sẽ là lựa chọn trọn vẹn nhất (scene 3D toàn phần nhiều chi tiết, khắc tên nổi và phụ kiện độc quyền).\n' +
      'Nếu đặt số lượng nhiều cho doanh nghiệp, bạn vui lòng nhắn Zalo **0983806933** để bên mình gửi báo giá chi tiết và demo 3D nhé.'
    )
  }
  if (/(sinh nhật|kỷ niệm|bạn gái|bạn trai|tình yêu|450k|signature|2 nhân vật)/i.test(t)) {
    return (
      'Với dịp đặc biệt này, gói **Signature Box (450K)** rất được yêu thích vì hỗ trợ **2–3 nhân vật standee 3D**, bối cảnh 3 tầng đa lớp kèm hộp đèn LED mini và mã QR video lời chúc.\n' +
      '- **Cách xem mẫu ngay:** Nhắn `"Tạo ảnh standee [mô tả], tone [màu]"` hoặc bấm nút 🖼 đính kèm ảnh thật trong khung chat này.\n' +
      '- **Chốt đơn & duyệt demo:** Nhắn Zalo **0983806933** nhé!'
    )
  }
  if (/(giá|bao nhiêu|chi phí|gói|bảng giá)/i.test(t)) {
    return (
      'MomentBox hiện có 3 gói thiết kế hộp quà standee 3D độc bản:\n' +
      '- **Lite Box — 250K:** 1 nhân vật standee 3D, 1 concept màu chủ đạo, thiệp chúc mừng.\n' +
      '- **Signature Box — 450K (phổ biến nhất):** 2–3 nhân vật, bối cảnh đa lớp, đèn LED mini và QR video lời chúc.\n' +
      '- **Premium Scene — 700K:** Scene 3D toàn phần, khắc tên nổi, phụ kiện độc quyền.\n' +
      'Bạn muốn tặng cho dịp nào để mình gợi ý concept và tạo thử ảnh mẫu giúp bạn nhé?'
    )
  }

  return (
    'Chào bạn, MomentBox có 3 gói standee 3D từ **250K (Lite Box)**, **450K (Signature Box)** đến **700K (Premium Scene)**, đều được duyệt bản demo 3D trước khi in ấn.\n' +
    'Bạn cho mình biết thêm **dịp tặng** và **số nhân vật / ngân sách dự kiến**, hoặc nhắn trực tiếp `"Tạo ảnh standee..."` để xem mẫu ngay nhé. Chốt đơn nhanh qua Zalo **0983806933**.'
  )
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  // Chống spam: 20 tin / phút / người
  const blocked = guard(event, { name: 'chat', limit: 20, windowMs: 60 * 1000 })
  if (blocked) return blocked

  let body
  try {
    body = JSON.parse(event.body)
  } catch (err) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Dữ liệu gửi lên không hợp lệ.' }),
    }
  }

  const messages = cleanMessages(body.messages)
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')

  if (!latestUserMessage) {
    return {
      statusCode: 400,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Vui lòng nhập nội dung cần tư vấn.' }),
    }
  }

  const { geminiKey, openaiKey, cfAccount, cfToken } = getKeys()

  if (!geminiKey && !openaiKey && !(cfAccount && cfToken)) {
    return okReply(buildSmartAdvisorReply(messages), 'MomentBox Advisor (Fallback)')
  }

  const failures = []

  // Thứ tự dự phòng: Gemini -> OpenAI -> Cloudflare Workers AI (Llama 3.3) -> Bộ tư vấn nội bộ
  if (geminiKey) {
    const res = await tryGeminiChat(geminiKey, messages, CHAT_SYSTEM_PROMPT)
    if (res.ok) return okReply(res.text, res.provider)
    failures.push(`Gemini: ${res.message}`)
  }

  if (openaiKey) {
    const res = await tryOpenAiChat(openaiKey, messages, CHAT_SYSTEM_PROMPT)
    if (res.ok) return okReply(res.text, res.provider)
    failures.push(`OpenAI: ${res.message}`)
  }

  if (cfAccount && cfToken) {
    const res = await callCloudflareChat({
      cfAccount,
      cfToken,
      messages,
      systemPrompt: CHAT_SYSTEM_PROMPT,
      temperature: 0.6,
      maxTokens: 900,
      timeoutMs: 15000,
    })
    if (res.ok) return okReply(res.text, `Cloudflare (${res.model})`)
    failures.push(`Cloudflare: ${res.message}`)
  }

  console.warn('[chat] All LLM providers unavailable, using smart fallback:', failures.join(' | '))
  return okReply(buildSmartAdvisorReply(messages), 'MomentBox Advisor (Fallback)')
}
