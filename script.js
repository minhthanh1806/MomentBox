const revealElements = document.querySelectorAll('.reveal');
const revealedSet = new WeakSet();

revealElements.forEach((el, index) => {
  el.style.transitionDelay = `${Math.min(index * 70, 360)}ms`;
});

const revealOnScroll = () => {
  const trigger = window.innerHeight * 0.9;
  revealElements.forEach((el) => {
    const top = el.getBoundingClientRect().top;
    if (top < trigger && !revealedSet.has(el)) {
      el.classList.add('visible');
      revealedSet.add(el);
    }
  });
};

revealOnScroll();
window.addEventListener('scroll', revealOnScroll);

const aiChatForm = document.querySelector('#aiChatForm');
const aiChatInput = document.querySelector('#aiChatInput');
const aiChatMessages = document.querySelector('#aiChatMessages');
const aiChatStatus = document.querySelector('#aiChatStatus');

if (aiChatForm && aiChatInput && aiChatMessages) {
  const chatHistory = [
    {
      role: 'assistant',
      content:
        'Chào bạn, mình có thể gợi ý concept standee 3D theo dịp tặng, tone màu, số nhân vật và ngân sách. Bạn muốn làm quà cho dịp gì?',
    },
  ];

  const setChatStatus = (message, tone = 'neutral') => {
    if (!aiChatStatus) return;
    aiChatStatus.textContent = message;
    aiChatStatus.dataset.tone = tone;
  };

  const formatMarkdown = (text) => {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = html.replace(/^(?:###|##|#)\s+(.+)$/gm, '<h4 class="chat-h4">$1</h4>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\s*[\*\-]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(?:<li>.*?<\/li>(?:\r?\n)?)+/g, (match) => {
      return `<ul>${match.replace(/[\r\n]+/g, '')}</ul>`;
    });
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/(<\/h4>|<ul>|<\/ul>|<li>|<\/li>)<br>/g, '$1');
    html = html.replace(/<br>(<h4|<ul>|<\/ul>|<li>)/g, '$1');
    return html;
  };

  const addChatMessage = (role, content) => {
    const bubble = document.createElement('div');
    bubble.className = `ai-message ai-message-${role === 'user' ? 'user' : 'bot'}`;

    if (role === 'user') {
      const text = document.createElement('p');
      text.textContent = content;
      bubble.append(text);
    } else {
      const text = document.createElement('div');
      text.className = 'ai-message-content';
      text.innerHTML = formatMarkdown(content);
      bubble.append(text);
    }
    aiChatMessages.append(bubble);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  };

  // ---- Đính kèm ảnh thật của khách ----
  const attachInput = document.querySelector('#attachInput');
  const attachBtn = document.querySelector('#attachBtn');
  const attachPreview = document.querySelector('#attachPreview');
  const attachThumb = document.querySelector('#attachThumb');
  const attachName = document.querySelector('#attachName');
  const attachRemove = document.querySelector('#attachRemove');
  let attachedImage = null; // { mimeType, data (base64), dataUrl, name }

  const clearAttachment = () => {
    attachedImage = null;
    if (attachInput) attachInput.value = '';
    if (attachPreview) attachPreview.hidden = true;
    aiChatInput.required = true;
  };

  // Thu nhỏ ảnh về tối đa 1024px (JPEG) để gửi nhanh và nhẹ
  const resizeImageFile = (file) =>
    new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const maxSide = 1024;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ mimeType: 'image/jpeg', data: dataUrl.split(',')[1], dataUrl, name: file.name });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Không đọc được ảnh này.'));
      };
      img.src = url;
    });

  if (attachBtn && attachInput) {
    attachBtn.addEventListener('click', () => attachInput.click());

    attachInput.addEventListener('change', async () => {
      const [file] = attachInput.files || [];
      if (!file) return;

      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        setChatStatus('Chỉ nhận ảnh JPG, PNG hoặc WEBP.', 'error');
        attachInput.value = '';
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        setChatStatus('Ảnh quá lớn, vui lòng chọn ảnh dưới 8MB.', 'error');
        attachInput.value = '';
        return;
      }

      try {
        attachedImage = await resizeImageFile(file);
        attachThumb.src = attachedImage.dataUrl;
        attachName.textContent = attachedImage.name;
        attachPreview.hidden = false;
        aiChatInput.required = false;
        setChatStatus('Đã chọn ảnh. Mô tả thêm (dịp, màu, "chibi" nếu muốn) rồi bấm Gửi.', 'success');
        aiChatInput.focus();
      } catch (err) {
        clearAttachment();
        setChatStatus(err.message || 'Không đọc được ảnh này.', 'error');
      }
    });
  }

  if (attachRemove) attachRemove.addEventListener('click', clearAttachment);

  let hasGeneratedImage = false;
  let lastSubjectSummary = '';

  const isServiceQuestion = (t) =>
    /(giá|bao nhiêu|chi phí|ship|vận chuyển|giao hàng|mấy ngày|bao lâu|địa chỉ|ở đâu|kích thước|size|chất liệu|mica|giấy|bảo hành|đặt cọc|đặt hàng|cách đặt|tư vấn gói|zalo|liên hệ|gói nào|viết prompt)/i.test(t);

  const wantsImage = (text) => {
    const t = text.toLowerCase().trim();
    if (isServiceQuestion(t)) return false;
    if (
      /(tạo|gen|vẽ|render|làm|thiết kế|cho xem|cho mình).{0,40}(ảnh|hình|standee|mẫu)/.test(t) ||
      /(ảnh|hình).{0,20}standee/.test(t) ||
      /standee.{0,40}(ảnh|hình)/.test(t) ||
      /^(tạo|gen|vẽ|làm|thiết kế)\s+(cho\s+mình|giúp\s+mình|mẫu|thử|1\s+bạn|1\s+anh|1\s+cô|cặp\s+đôi|nhân\s+vật)/i.test(t)
    ) {
      return true;
    }
    // Nhận diện câu chỉnh sửa nối tiếp ngay sau khi đã tạo ảnh
    if (
      hasGeneratedImage &&
      t.length <= 160 &&
      /(tạo lại|vẽ lại|sửa lại|đổi|thêm|bỏ|chuyển|sang|kiểu|chibi|bình thường|tỉ lệ|màu|tone|áo|váy|vest|tóc|hoa|cầm|đội|mũ|nền|hộp)/i.test(t)
    ) {
      return true;
    }
    return false;
  };

  const addChatImage = (image) => {
    const bubble = document.createElement('div');
    bubble.className = 'ai-message ai-message-bot';

    const src = `data:${image.mimeType};base64,${image.data}`;
    const img = document.createElement('img');
    img.src = src;
    img.alt = 'Ảnh standee do AI tạo';
    img.style.cssText = 'max-width:100%;border-radius:12px;display:block;';
    const link = document.createElement('a');
    link.href = src;
    link.download = 'momentbox-standee.png';
    link.textContent = '⬇️ Tải ảnh về';
    link.style.cssText = 'display:inline-block;margin-top:8px;font-weight:600;';
    bubble.append(img, link);
    aiChatMessages.append(bubble);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  };

  aiChatForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const typed = aiChatInput.value.trim();
    if (!typed && !attachedImage) return;

    // Gửi kèm ảnh: lấy ảnh ra khỏi ô đính kèm rồi dọn dẹp giao diện
    const photo = attachedImage;
    const message = typed || 'Tạo ảnh standee giống người trong ảnh tôi gửi.';
    clearAttachment();

    aiChatInput.value = '';
    aiChatInput.style.height = '';
    addChatMessage('user', message);
    if (photo) {
      const lastBubble = aiChatMessages.lastElementChild;
      const thumb = document.createElement('img');
      thumb.src = photo.dataUrl;
      thumb.alt = 'Ảnh bạn đã gửi';
      thumb.className = 'user-photo';
      if (lastBubble) lastBubble.prepend(thumb);
    }
    chatHistory.push({ role: 'user', content: message });
    setChatStatus('AI đang soạn gợi ý...', 'loading');

    const submitButton = aiChatForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      if (photo || wantsImage(message)) {
        setChatStatus('🔍 AI đang tìm nhân vật trên mạng & vẽ standee, vui lòng chờ 10-30 giây...', 'loading');
        const imgResponse = await fetch('/api/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: chatHistory.slice(-8),
            ...(lastSubjectSummary && !photo ? { previousSubject: lastSubjectSummary } : {}),
            ...(photo ? { image: { mimeType: photo.mimeType, data: photo.data } } : {}),
          }),
        });
        const imgData = await imgResponse.json().catch(() => ({}));
        if (!imgResponse.ok || !imgData.image) {
          throw new Error(
            imgData.error ||
              `Chưa tạo được ảnh (mã ${imgResponse.status}). Có thể server hết thời gian chờ, bạn thử lại hoặc xem log terminal nhé.`
          );
        }
        addChatImage(imgData.image);
        hasGeneratedImage = true;
        if (imgData.meta?.summary) {
          lastSubjectSummary = imgData.meta.summary;
        }
        const styleLabel = imgData.meta?.style === 'chibi' ? 'Chibi' : 'Tỉ lệ bình thường';
        chatHistory.push({
          role: 'assistant',
          content: `(Đã tạo ảnh standee - ${styleLabel}${imgData.meta?.summary ? ` | Chủ thể: ${imgData.meta.summary}` : ''})`,
        });
        setChatStatus(
          `Đã tạo mẫu (${styleLabel}). Bạn có thể nhắn tiếp để sửa màu, trang phục, hoặc thêm "chibi" để đổi phong cách.`,
          'success'
        );
        return;
      }

      let reply;
      let isMock = false;

      const isLocal = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1' || 
                      window.location.protocol === 'file:';

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: chatHistory.slice(-8) }),
        });

        if (response.status === 404) {
          throw new Error('API_NOT_FOUND');
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'Không thể kết nối AI lúc này.');
        }

        reply = data.reply || 'Mình chưa có gợi ý phù hợp. Bạn thử mô tả thêm về dịp tặng nhé.';
      } catch (innerError) {
        const isNetworkOr404 = innerError.message === 'API_NOT_FOUND' || 
                               innerError.name === 'TypeError' || 
                               innerError.message.includes('fetch');

        if (isLocal && isNetworkOr404) {
          isMock = true;
          const msgLower = message.toLowerCase();
          if (msgLower.includes('giá') || msgLower.includes('bao nhiêu') || msgLower.includes('chi phí') || msgLower.includes('gói')) {
            reply = 'Momentbox hiện tại có 3 gói thiết kế chính:\n1. Lite Box (250K): 1 nhân vật standee 3D + concept màu + thiệp chúc mừng.\n2. Signature Box (450K): 2-3 nhân vật + bối cảnh đa lớp + hộp đèn mini + QR video lời chúc.\n3. Premium Scene (700K): Bối cảnh 3D toàn cảnh chi tiết + khắc tên nổi + phụ kiện riêng.\n\nBạn xem gói nào phù hợp với nhu cầu của mình nhé!';
          } else if (msgLower.includes('sinh nhật') || msgLower.includes('quà') || msgLower.includes('tặng')) {
            reply = 'Với dịp sinh nhật, concept Birthday Stage (gói Lite 250K) hoặc Signature Box (450K) có tích hợp đèn led sẽ cực kỳ nổi bật và ý nghĩa đó ạ! Bạn muốn làm quà tặng bạn nam hay bạn nữ, bao nhiêu nhân vật để mình tư vấn thêm nhé?';
          } else if (msgLower.includes('kỷ niệm') || msgLower.includes('yêu') || msgLower.includes('cưới') || msgLower.includes('wedding') || msgLower.includes('chibi')) {
            reply = 'Concept Love Memory hoặc Mẫu Cưới Thanh Lịch (gói Signature Box 450K) hỗ trợ 2–3 nhân vật theo tỉ lệ tự nhiên (hoặc chibi nếu bạn yêu cầu), kèm đèn LED mini và QR video lời chúc. Bạn nhắn Zalo 0983806933 để bên mình lên demo 3D nhé!';
          } else if (msgLower.includes('kỷ yếu') || msgLower.includes('tốt nghiệp') || msgLower.includes('học sinh') || msgLower.includes('trường')) {
            reply = 'Concept Kỷ Yếu / Tốt Nghiệp lưu giữ thanh xuân rất thích hợp với gói Signature Box (450K) hoặc Premium Scene (700K). Bên mình có thể dựng standee nhân vật mặc áo cử nhân kết hợp bối cảnh lớp học, bảng đen 3D nhiều lớp cực kỳ ý nghĩa ạ!';
          } else if (msgLower.includes('anime') || msgLower.includes('manga') || msgLower.includes('hoạt hình') || msgLower.includes('game') || msgLower.includes('2d')) {
            reply = 'Với các concept nhân vật Anime, Manga hoặc nhân vật Game 2D, tụi mình sẽ dựng standee theo đúng phong cách vẽ (art-style) gốc của nhân vật, kết hợp hiệu ứng bối cảnh thế giới ảo 3D cực ngầu. Bạn gửi ảnh nhân vật qua Zalo 0983806933 nhé!';
          } else if (msgLower.includes('địa chỉ') || msgLower.includes('ở đâu') || msgLower.includes('shop') || msgLower.includes('cửa hàng')) {
            reply = 'MomentBox nhận thiết kế và giao hàng toàn quốc, luôn gửi bản vẽ demo 3D để bạn duyệt trước khi in ấn sản xuất. Để biết chi tiết địa chỉ và phí ship cụ thể, bạn nhắn Zalo 0983806933 để nhân viên xác nhận nhanh nhé!';
          } else if (msgLower.includes('zalo') || msgLower.includes('liên hệ') || msgLower.includes('đặt hàng')) {
            reply = 'Bạn có thể nhắn tin trực tiếp qua Zalo số 0983806933 hoặc click vào nút "Chat Zalo" ở góc phải màn hình để được hỗ trợ lên ý tưởng nhanh nhất nhé!';
          } else {
            reply = 'Ý tưởng của bạn nghe rất tuyệt! Bạn có thể tùy chọn thêm số lượng nhân vật, tone màu chủ đạo hoặc lời chúc. Để nhận tư vấn demo 3D nhanh và chính xác nhất, bạn đừng ngần ngại gửi ảnh qua Zalo 0983806933 nhé!';
          }
          
          reply = '🤖 [Chế độ giả lập cục bộ]: ' + reply;
        } else {
          throw innerError;
        }
      }

      addChatMessage('assistant', reply);
      chatHistory.push({ role: 'assistant', content: reply });
      
      if (isMock) {
        setChatStatus('', 'success');
      } else {
        setChatStatus('Có thể tiếp tục hỏi thêm hoặc nhắn Zalo để chốt concept.', 'success');
      }
    } catch (error) {
      const fallback =
        error instanceof Error ? error.message : 'AI đang gặp lỗi kết nối. Vui lòng thử lại sau.';
      addChatMessage('assistant', fallback);
      setChatStatus('Chưa gửi được yêu cầu AI.', 'error');
    } finally {
      if (submitButton) submitButton.disabled = false;
      aiChatInput.focus();
    }
  });

  aiChatInput.addEventListener('input', () => {
    aiChatInput.style.height = 'auto';
    aiChatInput.style.height = `${Math.min(aiChatInput.scrollHeight, 132)}px`;
  });

  aiChatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      aiChatForm.requestSubmit();
    }
  });
}

// Smooth scroll for AI Chat FAB
const aiChatFab = document.querySelector('.ai-chat-fab');
if (aiChatFab) {
  aiChatFab.addEventListener('click', (event) => {
    event.preventDefault();
    const target = document.querySelector('#ai-chat');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

// Quick Prompt Chips: bấm để điền nhanh vào ô chat AI
const promptChips = document.querySelectorAll('.prompt-chip');
if (promptChips.length && aiChatInput) {
  promptChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const promptText = chip.dataset.prompt || chip.textContent.trim();
      aiChatInput.value = promptText;
      aiChatInput.dispatchEvent(new Event('input'));
      aiChatInput.focus();
      if (aiChatStatus) {
        aiChatStatus.textContent = 'Đã điền gợi ý. Bạn có thể chỉnh sửa thêm hoặc bấm Gửi.';
        aiChatStatus.dataset.tone = 'neutral';
      }
    });
  });
}

// Header cuộn mượt & Menu điện thoại
const siteHeader = document.querySelector('#siteHeader');
const navToggle = document.querySelector('#navToggle');
if (siteHeader) {
  const onScroll = () => {
    siteHeader.classList.toggle('scrolled', window.scrollY > 24);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

if (siteHeader && navToggle) {
  navToggle.addEventListener('click', () => {
    const isOpen = siteHeader.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  siteHeader.querySelectorAll('.main-nav a').forEach((link) => {
    link.addEventListener('click', () => {
      siteHeader.classList.remove('nav-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

