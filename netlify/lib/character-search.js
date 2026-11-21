// Quy trình tự tìm kiếm & xem ảnh nhân vật trên mạng (Wikipedia + AniList, 0-neuron khi bóc tách)
const { timedFetch, inspectImageWithVision } = require('./ai-keys')

const STOP_PHRASES = [
  'tạo ảnh', 'vẽ ảnh', 'làm ảnh', 'gen ảnh', 'tạo hình', 'tạo mẫu', 'vẽ mẫu', 'làm mẫu',
  'cho mình', 'giúp mình', 'giúp tôi', 'cho tôi', 'cho xem', 'tạo giúp', 'vẽ giúp',
  'phong cách', 'bình thường', 'tỉ lệ thật', 'tỉ lệ bình thường', 'không chibi', 'ko chibi',
  'hộp quà', 'nhân vật', 'sinh viên', 'tốt nghiệp', 'cử nhân', 'học sinh', 'kỷ yếu',
  'cặp đôi', 'người yêu', 'bạn gái', 'bạn trai', 'bạn thân', 'kỷ niệm', 'tình yêu',
  'cô dâu', 'chú rể', 'đám cưới', 'sinh nhật', 'gia đình', 'bố mẹ', 'ba mẹ', 'con cái',
  'cô gái', 'chàng trai', 'bạn nữ', 'bạn nam', 'người thật', 'áo dài', 'áo vest', 'váy cưới',
  'áo cử nhân', 'hoa sen', 'hoa hướng dương', 'hoa hồng', 'bó hoa', 'bánh kem', 'nắm tay',
  'mỉm cười', 'dễ thương', 'lịch lãm', 'xinh đẹp', 'sang trọng', 'ngầu lòi', 'cá tính',
  'trong ảnh', 'theo ảnh', 'giống ảnh', 'tôi gửi', 'mình gửi', 'bên trên', 'màu xanh',
  'xanh mint', 'xanh navy', 'xanh dương', 'hồng pastel', 'màu hồng', 'màu trắng', 'màu đen',
  'bối cảnh', 'đổi sang', 'chuyển sang', 'sửa lại', 'tạo lại', 'vẽ lại', 'mô hình',
]

const STOP_WORDS = new Set([
  'tạo', 'vẽ', 'gen', 'render', 'làm', 'thiết', 'kế', 'cho', 'giúp', 'mình', 'tôi', 'em', 'anh', 'chị', 'bạn', 'shop',
  'ảnh', 'hình', 'standee', '3d', 'mẫu', 'hộp', 'quà', 'kiểu', 'dạng', 'chibi', 'thật', 'bé', 'cậu', 'cô', 'chú', 'bác',
  'trong', 'của', 'với', 'và', 'hay', 'hoặc', 'ở', 'tại', 'về', 'từ', 'theo', 'như', 'này', 'đó', 'kia', 'một', 'hai', 'ba',
  'phim', 'game', 'anime', 'truyện', 'manga', 'hoạt', 'bộ', 'tựa', 'series', 'nhân', 'vật', 'nữ', 'nam', 'người',
  'cầm', 'mặc', 'đội', 'đeo', 'ngồi', 'đứng', 'ôm', 'nhìn', 'cười', 'chạy', 'nhảy', 'tặng', 'dịp', 'đổi', 'thêm', 'bỏ',
  'tone', 'màu', 'tông', 'nền', 'trắng', 'đen', 'xanh', 'hồng', 'vàng', 'đỏ', 'tím', 'cam', 'nâu', 'kem', 'bạc', 'mint', 'navy', 'pastel',
  'bó', 'hoa', 'bằng', 'mũ', 'nón', 'áo', 'váy', 'quần', 'vest', 'giày', 'kính', 'sách', 'nến', 'bánh', 'bóng', 'tim', 'thư', 'đèn', 'cổng',
  'dễ', 'thương', 'đẹp', 'xinh', 'ngầu', 'lạnh', 'lùng', 'vui', 'tươi', 'buồn', 'lãng', 'mạn', 'cổ', 'trang', 'truyền', 'thống',
  'a', 'an', 'the', 'in', 'on', 'of', 'with', 'and', 'from', 'by', 'as', 'style', 'make', 'create', 'draw', 'generate',
  'attached', 'photo', 'image', 'picture', 'people', 'person', 'couple', 'portrait', 'theme', 'background', 'box',
  'valentine', 'wedding', 'birthday', 'graduation', 'family', 'corporate', 'anniversary',
])

const FRANCHISE_HINT_RE =
  /\b(genshin\s*impact|honkai\s*star\s*rail|resident\s*evil(?:\s*\d+)?|one\s*piece|naruto|spy\s*x\s*family|solo\s*leveling|jujutsu\s*kaisen|demon\s*slayer|kimetsu\s*no\s*yaiba|attack\s*on\s*titan|dragon\s*ball|god\s*of\s*war|league\s*of\s*legends|valorant|marvel|dc\s*comics|pokemon|harry\s*potter|detective\s*conan)\b/gi

// Bóc tách tên nhân vật không tốn neuron AI (xử lý cả chữ thường lẫn chữ hoa)
const extractCharacterCandidate = (requests) => {
  const joined = (Array.isArray(requests) ? requests : [String(requests || '')]).join(' ').trim()
  if (!joined) return { isCharacter: false, rawQuery: '', coreName: '' }

  let cleaned = joined.toLowerCase()
  for (const phrase of STOP_PHRASES) {
    cleaned = cleaned.replace(new RegExp(phrase, 'gi'), ' ')
  }

  const tokens = cleaned
    .split(/[\s,.;:!?()[\]"'/\\|]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t) && !/^\d+$/.test(t))

  if (!tokens.length) return { isCharacter: false, rawQuery: '', coreName: '' }

  const rawQuery = tokens.slice(0, 6).join(' ')
  const coreOnly = rawQuery.replace(FRANCHISE_HINT_RE, ' ').replace(/\s+/g, ' ').trim()
  const coreName = (coreOnly || rawQuery).split(/\s+/).slice(0, 3).join(' ')

  return { isCharacter: true, rawQuery, coreName }
}

const isUsableImageUrl = (url) =>
  !!url && /\.(png|jpe?g|webp)(\?|$)/i.test(url) && !/(Commons-logo|Wiki|Ambox|Flag_of|Disambig)/i.test(url)

const fetchWikiLang = async (lang, query) => {
  const api =
    `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}` +
    '&gsrlimit=1&prop=pageimages|extracts&pilicense=any&piprop=thumbnail&pithumbsize=512&exintro=1&explaintext=1&exchars=420&format=json'

  const res = await timedFetch(api, { headers: { 'User-Agent': 'MomentBoxBot/1.0' } }, 3500)
  if (!res.ok) return null
  const data = await res.json().catch(() => ({}))
  const page = Object.values(data?.query?.pages || {})[0]
  if (!page?.title) return null

  let imageUrl = page?.thumbnail?.source || ''
  if (!isUsableImageUrl(imageUrl)) {
    imageUrl = ''
    try {
      const mediaUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/media-list/${encodeURIComponent(page.title.replace(/\s+/g, '_'))}`
      const mRes = await timedFetch(mediaUrl, { headers: { 'User-Agent': 'MomentBoxBot/1.0' } }, 2800)
      if (mRes.ok) {
        const mData = await mRes.json().catch(() => ({}))
        const item = (mData?.items || []).find(
          (i) => i.type === 'image' && i.srcset?.[0]?.src && isUsableImageUrl(`https:${i.srcset[0].src}`)
        )
        if (item) {
          const rawSrc = item.srcset[0].src
          imageUrl = rawSrc.startsWith('http') ? rawSrc : `https:${rawSrc}`
        }
      }
    } catch (err) {
      // bỏ qua media-list
    }
  }

  const extract = (page.extract || '').replace(/\s+/g, ' ').trim()
  if (!extract && !imageUrl) return null

  return {
    title: page.title,
    franchise: '',
    extract,
    imageUrl,
    pageUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/\s+/g, '_'))}`,
    source: 'Wikipedia',
  }
}

const fetchCharacterFromWikipedia = async (searchQuery) => {
  if (!searchQuery) return null
  try {
    const en = await fetchWikiLang('en', searchQuery)
    if (en && (en.imageUrl || en.extract)) return en
    const vi = await fetchWikiLang('vi', searchQuery)
    return vi || en || null
  } catch (err) {
    return null
  }
}

const cleanAniListText = (raw) =>
  String(raw || '')
    .replace(/~!([\s\S]*?)!~/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/__|[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360)

const fetchCharacterFromAniList = async (searchQuery) => {
  if (!searchQuery) return null
  const query = `
    query ($search: String) {
      Character(search: $search) {
        name { full }
        siteUrl
        image { large }
        description(asHtml: false)
        media(perPage: 1, sort: POPULARITY_DESC) {
          nodes { title { english romaji } }
        }
      }
    }
  `
  try {
    const res = await timedFetch(
      'https://graphql.anilist.co',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { search: searchQuery } }),
      },
      3500
    )
    if (!res.ok) return null
    const data = await res.json().catch(() => ({}))
    const c = data?.data?.Character
    if (!c?.name?.full) return null

    const mediaTitle = c.media?.nodes?.[0]?.title?.english || c.media?.nodes?.[0]?.title?.romaji || ''
    return {
      title: c.name.full,
      franchise: mediaTitle,
      extract: cleanAniListText(c.description),
      imageUrl: c.image?.large || '',
      pageUrl: c.siteUrl || '',
      source: 'AniList',
    }
  } catch (err) {
    return null
  }
}

const inspectCharacterImageFromUrl = async (imageUrl, keys) => {
  if (!imageUrl) return ''
  try {
    const res = await timedFetch(imageUrl, { headers: { 'User-Agent': 'MomentBoxBot/1.0' } }, 4000)
    if (!res.ok) return ''
    const mimeType = (res.headers.get('content-type') || '').split(';')[0].trim()
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(mimeType)) return ''

    const buf = Buffer.from(await res.arrayBuffer())
    if (!buf.length || buf.length > 2_000_000) return ''

    const prompt =
      'Look closely at this official character image and list their exact visual design traits for an illustrator: hair color & hairstyle, eye color, headwear/horns/ears/glasses, exact outfit style & colors, and iconic accessories. Output 1 concise English sentence (max 55 words).'

    return await inspectImageWithVision({
      mimeType,
      base64: buf.toString('base64'),
      prompt,
      keys,
      maxTokens: 140,
    })
  } catch (err) {
    return ''
  }
}

// Kiểm tra xem kết quả từ Wikipedia / AniList có khớp tối thiểu với tên tìm kiếm không
const matchesQuery = (candidateTitle, rawQuery) => {
  if (!candidateTitle) return false
  const titleWords = candidateTitle.toLowerCase().split(/[\s\-_:()]+/).filter((w) => w.length >= 2)
  const queryWords = rawQuery.toLowerCase().split(/\s+/).filter((w) => w.length >= 2)
  return queryWords.some((q) => titleWords.some((t) => t.includes(q) || q.includes(t)))
}

// Điều phối tìm kiếm nhân vật trực tuyến (Wikipedia + AniList song song, Vision AI nhìn ảnh nếu còn quota)
const lookupCharacterOnline = async (requests, knownChar, keys, hasUserPhoto) => {
  const fallbackResult = knownChar
    ? {
        found: true,
        characterName: knownChar.canonicalName,
        franchise: knownChar.franchise,
        bio: knownChar.visualSpec,
        imageUrl: '',
        pageUrl: '',
        visualInspection: '',
        source: 'Local Dictionary',
      }
    : { found: false }

  const candidate = knownChar
    ? {
        isCharacter: true,
        rawQuery: `${knownChar.canonicalName} ${knownChar.franchise}`,
        coreName: knownChar.canonicalName,
      }
    : extractCharacterCandidate(requests)

  if (!candidate.isCharacter || !candidate.rawQuery) return fallbackResult

  try {
    return await Promise.race([
      (async () => {
        const [wiki, anilist] = await Promise.all([
          fetchCharacterFromWikipedia(candidate.rawQuery),
          fetchCharacterFromAniList(candidate.coreName),
        ])

        const wikiValid = wiki && (knownChar || matchesQuery(wiki.title, candidate.rawQuery) || matchesQuery(wiki.extract, candidate.coreName))
        const aniValid = anilist && (knownChar || matchesQuery(anilist.title, candidate.coreName) || matchesQuery(anilist.franchise, candidate.rawQuery))

        const validWiki = wikiValid ? wiki : null
        const validAni = aniValid ? anilist : null

        if (!validWiki && !validAni) return fallbackResult

        // Ưu tiên tên từ Wikipedia hoặc AniList; lấy ảnh tốt nhất; gộp mô tả ngắn gọn
        const primary = validWiki?.imageUrl ? validWiki : validAni?.imageUrl ? validAni : validWiki || validAni
        const imageUrl = validWiki?.imageUrl || validAni?.imageUrl || ''
        const combinedBio = [
          knownChar?.visualSpec || '',
          validWiki?.extract || '',
          validAni?.extract && validAni.extract !== validWiki?.extract ? validAni.extract : '',
        ]
          .filter(Boolean)
          .join(' ')
          .slice(0, 550)

        const sources = [validWiki && 'Wikipedia', validAni && 'AniList'].filter(Boolean).join(' + ')
        const visualInspection =
          !hasUserPhoto && imageUrl ? await inspectCharacterImageFromUrl(imageUrl, keys) : ''

        const preferredName =
          knownChar?.canonicalName ||
          (validWiki && matchesQuery(validWiki.title, candidate.coreName) ? validWiki.title : primary.title)

        return {
          found: true,
          characterName: preferredName,
          franchise: knownChar?.franchise || (preferredName === validWiki?.title ? '' : validAni?.franchise || ''),
          bio: combinedBio,
          imageUrl,
          pageUrl: primary.pageUrl || '',
          visualInspection,
          source: visualInspection ? `${sources} + Vision AI` : sources,
        }
      })(),
      new Promise((resolve) => setTimeout(() => resolve(fallbackResult), 9500)),
    ])
  } catch (err) {
    return fallbackResult
  }
}

module.exports = {
  extractCharacterCandidate,
  fetchCharacterFromWikipedia,
  fetchCharacterFromAniList,
  inspectCharacterImageFromUrl,
  lookupCharacterOnline,
}
