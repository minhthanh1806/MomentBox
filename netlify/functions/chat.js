const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
}

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

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: jsonHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

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

  const openaiKey = process.env.OPENAI_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY

  let apiKey = ''
  let provider = 'openai'

  if (geminiKey && (geminiKey.startsWith('AIzaSy') || geminiKey.startsWith('AQ.'))) {
    apiKey = geminiKey
    provider = 'gemini'
  } else if (openaiKey) {
    apiKey = openaiKey
    if (openaiKey.startsWith('AIzaSy') || openaiKey.startsWith('AQ.')) {
      provider = 'gemini'
    } else {
      provider = 'openai'
    }
  }

  if (!apiKey) {
    return {
      statusCode: 503,
      headers: jsonHeaders,
      body: JSON.stringify({
        error: 'Chat AI chưa sẵn sàng. Vui lòng cấu hình OPENAI_API_KEY hoặc GEMINI_API_KEY trong Environment Variables.'
      }),
    }
  }

  const systemPrompt = 'Bạn là một trợ lý AI thông minh, đa năng và thân thiện tương tự như ChatGPT và Gemini. Bạn trả lời bằng tiếng Việt tự nhiên. Hãy luôn trình bày câu trả lời có bố cục rõ ràng (sử dụng tiêu đề dạng ###, danh sách gạch đầu dòng, các đoạn văn ngắn) và chèn thêm các biểu tượng cảm xúc (icons/emojis) sinh động cho từng mục để người dùng dễ đọc. Có thể giải đáp mọi chủ đề, câu hỏi khác nhau của người dùng. Nếu họ hỏi về thiết kế standee 3D hoặc quà tặng của Momentbox Studio, hãy tư vấn các gói thiết kế (Lite Box 250K, Signature Box 450K, Premium Scene 700K) và hướng dẫn liên hệ Zalo 0984579270.'

  try {
    // 1. If provider is Gemini, route to Google Gemini API
    if (provider === 'gemini') {
      let geminiMessages = messages.map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }))

      // Gemini API requires the first message in 'contents' to be from the 'user' role
      if (geminiMessages.length > 0 && geminiMessages[0].role === 'model') {
        geminiMessages.shift()
      }

      const candidateModels = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-3.5-flash',
        'gemini-3.1-flash-lite'
      ]
      let lastError = null
      let successResponse = null

      for (const model of candidateModels) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: geminiMessages,
                systemInstruction: {
                  parts: [{ text: systemPrompt }]
                },
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 2048
                }
              })
            }
          )

          if (response.ok) {
            successResponse = await response.json()
            break
          } else {
            const errorData = await response.json().catch(() => ({}))
            lastError = {
              status: response.status,
              message: errorData?.error?.message || 'Gemini API gặp sự cố.'
            }
            console.warn(`Model ${model} failed with status ${response.status}: ${lastError.message}. Trying next candidate...`)
          }
        } catch (fetchErr) {
          lastError = {
            status: 502,
            message: fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
          }
          console.warn(`Fetch error for model ${model}: ${lastError.message}. Trying next candidate...`)
        }
      }

      if (!successResponse) {
        return {
          statusCode: lastError?.status || 503,
          headers: jsonHeaders,
          body: JSON.stringify({
            error: lastError?.message || 'Tất cả các model Gemini đều đang bận. Vui lòng thử lại sau ít phút.'
          }),
        }
      }

      const reply = successResponse?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()

      return {
        statusCode: 200,
        headers: jsonHeaders,
        body: JSON.stringify({
          reply: reply || 'Mình chưa tạo được gợi ý lúc này. Bạn thử mô tả rõ hơn về dịp tặng nhé.'
        }),
      }
    }

    // 2. Otherwise assume it is an OpenAI API Key
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 1000,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          ...messages,
        ],
      }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData?.error?.message
      return {
        statusCode: response.status,
        headers: jsonHeaders,
        body: JSON.stringify({ error: errorMessage || 'AI đang bận. Vui lòng thử lại sau ít phút.' }),
      }
    }

    const data = await response.json()
    const reply = data?.choices?.[0]?.message?.content?.trim()

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify({
        reply: reply || 'Mình chưa tạo được gợi ý lúc này. Bạn thử mô tả rõ hơn về dịp tặng nhé.'
      }),
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      statusCode: 502,
      headers: jsonHeaders,
      body: JSON.stringify({ error: `Không thể kết nối với dịch vụ AI: ${errorMsg}` }),
    }
  }
}
