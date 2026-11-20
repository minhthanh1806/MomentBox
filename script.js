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

const uploadInput = document.querySelector('#uploadImage');
const uploadStatus = document.querySelector('#uploadStatus');
const userPreview = document.querySelector('#userPreview');
const previewFrame = document.querySelector('#previewFrame');
const frameLabel = document.querySelector('#frameLabel');
const previewInner = document.querySelector('#photoSlot');
const scaleRange = document.querySelector('#scaleRange');
const templateButtons = document.querySelectorAll('.template-btn');
const rotateTryon = document.querySelector('#rotateTryon');
const resetTryon = document.querySelector('#resetTryon');
const downloadTryon = document.querySelector('#downloadTryon');
const sendTryonZalo = document.querySelector('#sendTryonZalo');
const customerInput = document.querySelector('#customerName');
const previewCustomerName = document.querySelector('#previewCustomerName');

if (uploadInput && userPreview && previewFrame && scaleRange && previewInner) {
  const templateMeta = {
    wedding: {
      label: 'Mẫu Cưới Thanh Lịch',
      frameClass: 'template-wedding',
      backgroundSrc: 'images/wedding.jpg',
      slot: { left: 81.5, top: 28, width: 14, height: 50 },
      name: { left: 58.5, top: 17.5 },
    },
    chibi: {
      label: 'Mẫu Couple Chibi',
      frameClass: 'template-chibi',
      backgroundSrc: 'images/wedding2.jpg',
      slot: { left: 81.5, top: 28, width: 14, height: 50 },
      name: { left: 58.5, top: 17.5 },
    },
  };

  const templatePalette = {
    wedding: ['#f8f3f0', '#f0d6de'],
    chibi: ['#0f0d12', '#4c3d3f'],
  };

  const state = {
    offsetX: 0,
    offsetY: 0,
    scale: Number(scaleRange.value) / 100 || 1,
    rotate: 0,
    hasImage: false,
    templateKey: 'wedding',
  };

  const tiltConfig = {
    max: 8,
  };

  const setPreviewTilt = (x = 0, y = 0) => {
    if (!previewInner) return;
    previewInner.style.transform = `perspective(1200px) rotateX(${x}deg) rotateY(${y}deg)`;
  };

  const updateZaloLink = () => {
    if (!sendTryonZalo) return;
    const selected = templateMeta[state.templateKey]?.label || 'Mẫu Standee';
    const nameVal = customerInput ? customerInput.value.trim() : 'Linh & Minh';
    const message = `Mình muốn đặt concept ${selected} với tên "${nameVal}". Đã thử ghép ảnh trên website.`;
    sendTryonZalo.href = `https://zalo.me/0983806933?text=${encodeURIComponent(message)}`;
  };

  const applyImageTransform = () => {
    if (!userPreview) return;
    // ensure transform origin is center so translate(-50%,-50%) centers the image
    userPreview.style.transformOrigin = '50% 50%';
    userPreview.style.transform = `translate(calc(-50% + ${state.offsetX}px), calc(-50% + ${state.offsetY}px)) scale(${state.scale}) rotate(${state.rotate}deg)`;
  };

  const resetPosition = () => {
    state.offsetX = 0;
    state.offsetY = 0;
    state.scale = Number(scaleRange.value) / 100;
    state.rotate = 0;
    applyImageTransform();
  };

  const setTemplate = (templateKey) => {
    const next = templateMeta[templateKey];
    if (!next) return;

    state.templateKey = templateKey;
    previewFrame.classList.remove('template-wedding', 'template-chibi');
    previewFrame.classList.add(next.frameClass);
    if (frameLabel) frameLabel.textContent = next.label;
    previewFrame.style.setProperty('--template-image', `url("${next.backgroundSrc}")`);
    previewFrame.style.setProperty('--slot-left', `${next.slot.left}%`);
    previewFrame.style.setProperty('--slot-top', `${next.slot.top}%`);
    previewFrame.style.setProperty('--slot-width', `${next.slot.width}%`);
    previewFrame.style.setProperty('--slot-height', `${next.slot.height}%`);
    previewFrame.style.setProperty('--name-left', `${next.name.left}%`);
    previewFrame.style.setProperty('--name-top', `${next.name.top}%`);
    previewFrame.style.setProperty('--cover-left', `${next.name.left}%`);
    previewFrame.style.setProperty('--cover-top', `${next.name.top + 5.5}%`);

    const palette = templatePalette[templateKey];
    const guideCover = document.querySelector('#guideCover');
    if (guideCover && palette) {
      guideCover.style.background = `linear-gradient(to bottom, ${palette[0]}, ${palette[1]})`;
    }

    const nameOverlay = document.querySelector('.template-name-overlay');
    if (nameOverlay) {
      if (templateKey === 'wedding') {
        nameOverlay.style.background = '#ffffff';
        nameOverlay.style.color = '#5f2b51';
        nameOverlay.style.border = '1px solid rgba(176, 97, 149, 0.35)';
      } else {
        nameOverlay.style.background = '#1a141c';
        nameOverlay.style.color = '#ffe8d3';
        nameOverlay.style.border = '1px solid rgba(255, 232, 211, 0.35)';
      }
    }

    templateButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.template === templateKey);
    });

    updateZaloLink();
  };

  const roundedRect = (ctx, x, y, width, height, radius) => {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  };

  const exportTryonToPng = () => {
    try {
      if (!state.hasImage) {
        uploadStatus.textContent = 'Bạn cần tải ảnh trước khi xuất preview.';
        uploadStatus.style.color = '#b23b64';
        return;
      }

      if (!userPreview.naturalWidth || !userPreview.naturalHeight) {
        uploadStatus.textContent = 'Ảnh chưa tải xong, vui lòng đợi.';
        uploadStatus.style.color = '#b23b64';
        return;
      }

      const canvas = document.createElement('canvas');
      const exportWidth = 1080;
      const exportHeight = 1350;
      canvas.width = exportWidth;
      canvas.height = exportHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas không thể tạo context');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, exportWidth, exportHeight);

      const frameX = 70;
      const frameY = 70;
      const frameWidth = exportWidth - 140;
      const frameHeight = exportHeight - 190;

      const templateImage = new Image();
      templateImage.crossOrigin = 'anonymous';
      templateImage.src = templateMeta[state.templateKey].backgroundSrc;

      const drawTemplate = () => {
        try {
          ctx.save();
          roundedRect(ctx, frameX, frameY, frameWidth, frameHeight, 48);
          ctx.clip();
          if (templateImage.complete && templateImage.naturalWidth) {
            ctx.drawImage(templateImage, frameX, frameY, frameWidth, frameHeight);
          }

          const ratio = frameWidth / Math.max(previewInner.clientWidth, 1);
          const slotMeta = templateMeta[state.templateKey].slot;
          const slotX = frameX + frameWidth * (slotMeta.left / 100);
          const slotY = frameY + frameHeight * (slotMeta.top / 100);
          const slotWidth = frameWidth * (slotMeta.width / 100);
          const slotHeight = frameHeight * (slotMeta.height / 100);

          roundedRect(ctx, slotX, slotY, slotWidth, slotHeight, 18);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.76)';
          ctx.fill();

          ctx.save();
          roundedRect(ctx, slotX, slotY, slotWidth, slotHeight, 18);
          ctx.clip();

          const imageWidth = slotWidth * state.scale;
          const naturalRatio = userPreview.naturalHeight / Math.max(userPreview.naturalWidth, 1);
          const imageHeight = imageWidth * naturalRatio;
          const centerX = slotX + slotWidth / 2 + state.offsetX * ratio;
          const centerY = slotY + slotHeight / 2 + state.offsetY * ratio;

          ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
          ctx.shadowBlur = 18;
          ctx.shadowOffsetY = 8;
          ctx.drawImage(
            userPreview,
            centerX - imageWidth / 2,
            centerY - imageHeight / 2,
            imageWidth,
            imageHeight,
          );
          ctx.restore();

          roundedRect(ctx, slotX, slotY, slotWidth, slotHeight, 18);
          ctx.strokeStyle = 'rgba(195, 69, 137, 0.78)';
          ctx.setLineDash([10, 8]);
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.setLineDash([]);

          const palette = templatePalette[state.templateKey];
          const nameMeta = templateMeta[state.templateKey].name;
          if (palette) {
            ctx.save();
            const coverW = frameWidth * 0.18;
            const coverH = frameHeight * 0.07;
            const coverX = frameX + frameWidth * (nameMeta.left / 100) - coverW / 2;
            const coverY = frameY + frameHeight * 0.22;
            const grad = ctx.createLinearGradient(coverX, coverY, coverX, coverY + coverH);
            grad.addColorStop(0, palette[0]);
            grad.addColorStop(1, palette[1]);
            ctx.fillStyle = grad;
            ctx.fillRect(coverX, coverY, coverW, coverH);
            ctx.restore();
          }

          const customer = customerInput ? customerInput.value.trim() : 'Linh & Minh';

          ctx.save();
          const badgeW = Math.max(180, customer.length * 18);
          const badgeH = 48;
          const badgeX = frameX + frameWidth * (nameMeta.left / 100) - badgeW / 2;
          const badgeY = frameY + frameHeight * (nameMeta.top / 100) - 30;
          roundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 24);
          if (state.templateKey === 'wedding') {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(176, 97, 149, 0.35)';
          } else {
            ctx.fillStyle = '#1a141c';
            ctx.strokeStyle = 'rgba(255, 232, 211, 0.35)';
          }
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = state.templateKey === 'wedding' ? '#b12b74' : '#ffe8d3';
          ctx.font = '700 24px Manrope, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(customer.toUpperCase(), frameX + frameWidth * (nameMeta.left / 100), frameY + frameHeight * (nameMeta.top / 100) + 2);

          roundedRect(ctx, frameX, frameY, frameWidth, frameHeight, 48);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
          ctx.lineWidth = 8;
          ctx.stroke();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
          roundedRect(ctx, frameX + 24, exportHeight - 102, 320, 52, 26);
          ctx.fill();
          ctx.fillStyle = '#7a376b';
          ctx.font = '700 28px Manrope, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(templateMeta[state.templateKey].label, frameX + 44, exportHeight - 68);

          const link = document.createElement('a');
          const filename = `momentbox-preview-${state.templateKey}-${Date.now()}.png`;
          link.download = filename;
          link.href = canvas.toDataURL('image/png');
          link.click();

          uploadStatus.textContent = 'Đã xuất file PNG thành công.';
          uploadStatus.style.color = '#34654d';
        } catch (err) {
          console.error(err);
          uploadStatus.textContent = 'Lỗi khi xuất ảnh. Vui lòng thử lại.';
          uploadStatus.style.color = '#b23b64';
        }
      };

      if (templateImage.complete) {
        drawTemplate();
      } else {
        templateImage.onload = drawTemplate;
        templateImage.onerror = () => {
          drawTemplate();
        };
      }
    } catch (err) {
      console.error(err);
      uploadStatus.textContent = 'Lỗi nội bộ. Vui lòng thử lại.';
      uploadStatus.style.color = '#b23b64';
    }
  };

  uploadInput.addEventListener('change', () => {
    const [file] = uploadInput.files || [];
    if (!file) return;

    const validType = /^image\/(jpeg|png|webp)$/i.test(file.type);
    if (!validType) {
      uploadStatus.textContent = 'Ảnh không hợp lệ. Vui lòng chọn JPG/PNG/WEBP.';
      uploadStatus.style.color = '#b23b64';
      uploadInput.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      uploadStatus.textContent = 'Ảnh quá lớn. Vui lòng chọn ảnh dưới 5MB.';
      uploadStatus.style.color = '#b23b64';
      uploadInput.value = '';
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    state.hasImage = false;
    userPreview.style.display = 'none';
    userPreview.src = objectUrl;

    userPreview.onload = () => {
      URL.revokeObjectURL(objectUrl);
      state.hasImage = true;
      userPreview.style.display = 'block';
      const emptyEl = previewInner && previewInner.querySelector('.preview-empty');
      if (emptyEl) emptyEl.style.display = 'none';

      uploadStatus.textContent = `Đã tải ảnh: ${file.name}`;
      uploadStatus.style.color = '#34654d';

      resetPosition();
    };

    userPreview.onerror = () => {
      uploadStatus.textContent = 'Không thể tải ảnh, vui lòng thử file khác.';
      uploadStatus.style.color = '#b23b64';
      uploadInput.value = '';
      state.hasImage = false;
      userPreview.style.display = 'none';
    };
  });



  scaleRange.addEventListener('input', () => {
    state.scale = Number(scaleRange.value) / 100;
    applyImageTransform();
  });

  templateButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setTemplate(button.dataset.template);
    });
  });

  // Directional move controls removed — only scale and rotate remain.

  if (rotateTryon) {
    rotateTryon.addEventListener('click', () => {
      if (!state.hasImage) return;
      state.rotate = (state.rotate + 180) % 360;
      applyImageTransform();
    });
  }

  if (resetTryon) {
    resetTryon.addEventListener('click', () => {
      // Reset transforms only; keep uploaded image
      scaleRange.value = '100';
      state.offsetX = 0;
      state.offsetY = 0;
      state.scale = 1;
      state.rotate = 0;
      applyImageTransform();
    });
  }

  if (downloadTryon) {
    downloadTryon.addEventListener('click', exportTryonToPng);
  }

  // Drag-to-move and tilt interactions removed for simpler UX (only scale + rotate)

  if (customerInput && previewCustomerName) {
    customerInput.addEventListener('input', () => {
      previewCustomerName.textContent = customerInput.value.toUpperCase() || 'TÊN CỦA BẠN';
      updateZaloLink();
    });
  }

  setTemplate(state.templateKey);
  updateZaloLink();
  applyImageTransform();
}

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
    html = html.replace(/(<li>.*?<\/li>[\s\S]*?)+/g, (match) => {
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

  const addChatImage = (image, meta) => {
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
        addChatImage(imgData.image, imgData.meta);
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
            reply = 'Concept Love Memory hoặc Mẫu Cưới Thanh Lịch với 2 nhân vật vẽ chibi dễ thương rất thích hợp cho dịp kỷ niệm/đám cưới đó ạ. Bạn có thể tự ghép ảnh thử ở khung bên trên hoặc nhắn Zalo 0983806933 để bên mình vẽ chibi nhé!';
          } else if (msgLower.includes('kỷ yếu') || msgLower.includes('tốt nghiệp') || msgLower.includes('học sinh') || msgLower.includes('trường')) {
            reply = 'Concept Kỷ Yếu / Tốt Nghiệp lưu giữ thanh xuân rất thích hợp với gói Signature Box (450K) hoặc Premium Scene (700K). Bên mình có thể dựng standee nhân vật mặc áo cử nhân kết hợp bối cảnh lớp học, bảng đen 3D nhiều lớp cực kỳ ý nghĩa ạ!';
          } else if (msgLower.includes('anime') || msgLower.includes('manga') || msgLower.includes('hoạt hình') || msgLower.includes('game') || msgLower.includes('2d')) {
            reply = 'Với các concept nhân vật Anime, Manga hoặc nhân vật Game 2D, tụi mình sẽ dựng standee theo đúng phong cách vẽ (art-style) gốc của nhân vật, kết hợp hiệu ứng bối cảnh thế giới ảo 3D cực ngầu. Bạn gửi ảnh nhân vật qua Zalo 0983806933 nhé!';
          } else if (msgLower.includes('địa chỉ') || msgLower.includes('ở đâu') || msgLower.includes('shop') || msgLower.includes('cửa hàng')) {
            reply = 'Momentbox hoạt động online và nhận giao hàng toàn quốc từ TP. Hồ Chí Minh. Bạn có thể hoàn toàn yên tâm đặt hàng vì bên mình sẽ gửi bản vẽ demo 3D trước cho bạn duyệt, sau đó mới tiến hành in ấn và sản xuất ạ.';
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

