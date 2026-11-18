// Lớp bảo vệ dùng chung cho các hàm API: giới hạn kích thước, kiểm tra nguồn gọi, chống spam.
// Lưu ý: bộ đếm nằm trong bộ nhớ của từng instance nên chỉ là chống spam cơ bản.

const hits = new Map()

const json = (statusCode, error) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ error }),
})

const clientIp = (event) =>
  event.headers?.['x-nf-client-connection-ip'] ||
  (event.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
  'unknown'

// Trả về response lỗi nếu bị chặn, hoặc null nếu hợp lệ
const guard = (event, { name, limit, windowMs, maxBodyBytes = 20000 }) => {
  if ((event.body || '').length > maxBodyBytes) {
    return json(413, 'Yêu cầu quá lớn.')
  }

  // Chỉ cho website của chính mình gọi (chặn trang lạ dùng ké quota)
  const origin = event.headers?.origin
  if (origin) {
    let originHost = ''
    try {
      originHost = new URL(origin).host
    } catch (err) {
      return json(403, 'Nguồn gọi không hợp lệ.')
    }
    const host = event.headers?.host || ''
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(originHost)
    if (!isLocal && originHost !== host) {
      return json(403, 'Nguồn gọi không được phép.')
    }
  }

  const key = `${name}:${clientIp(event)}`
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    return json(429, 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.')
  }
  recent.push(now)
  hits.set(key, recent)

  // Dọn bộ nhớ định kỳ
  if (hits.size > 2000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => now - t < windowMs)) hits.delete(k)
    }
  }
  return null
}

module.exports = { guard }
