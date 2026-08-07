// Live video, whiteboard alignment, comments, likes, and floating reactions.
var liveStreamUrl = '';
var liveLikes = 0;
var liveCommentsCount = 0;
var liveHoverInterval = null;
var panelIsVisible = false;
var emojis = [];
var likedOnce = false;

var WHITEBOARD_SAFE_AREA = {
  naturalWidth: 1143,
  naturalHeight: 2048,
  left: 360 / 1143,
  top: 833 / 2048,
  width: 544 / 1143,
  height: 685 / 2048
};

var FALLBACK_EMOJIS = ['👄', '💦', '🫦', '👅', '💋', '😘', '🥰', '👀', '❤️‍🔥', '💕', '💞', '💓', '💖', '💘', '💝', '🤌🏻', '🖕🏻', '👣'];

var RANDOM_COMMENTS = [
  'So pretty',
  'Wow...',
  'Aww so cute',
  'Super look',
  'Amazing Kavya',
  'Love this',
  'That smile',
  'Looking gorgeous',
  'Live is perfect',
  'So sweet',
  'Beautiful frame',
  'Nice vibe'
];

async function getMediaId(client) {
  // 1. Try to find an active or visible media card with data-media-id
  var activeMediaCard = document.querySelector('.media-card.active[data-media-id]');
  if (activeMediaCard) {
    var id = activeMediaCard.getAttribute('data-media-id');
    if (id) return id;
  }
  var mediaCard = document.querySelector('.media-card[data-media-id]') || document.querySelector('[data-media-id]');
  if (mediaCard) {
    var cardId = mediaCard.getAttribute('data-media-id');
    if (cardId) return cardId;
  }

  // 2. Check global mediaDatabase array if available
  if (typeof mediaDatabase !== 'undefined' && Array.isArray(mediaDatabase) && mediaDatabase.length > 0 && mediaDatabase[0].id) {
    return mediaDatabase[0].id;
  }
  if (window.mediaDatabase && Array.isArray(window.mediaDatabase) && window.mediaDatabase.length > 0 && window.mediaDatabase[0].id) {
    return window.mediaDatabase[0].id;
  }

  // 3. Fallback: Query Supabase for any valid media_id from media table
  if (client) {
    try {
      var res = await client.from('media').select('id').limit(1).maybeSingle();
      if (res && res.data && res.data.id) return res.data.id;
    } catch (_) {}
  }

  console.warn('Could not find a media_id.');
  return null;
}

function getSupabaseClient() {
  if (typeof supabaseClient !== 'undefined') return supabaseClient;
  if (window.supabaseClient) return window.supabaseClient;
  return null;
}

function showLiveToast(message, type) {
  if (typeof showToast === 'function') showToast(message, type || 'success');
}

function splitEmojiText(text) {
  var compact = String(text || '').replace(/\s+/g, '');
  if (!compact) return [];
  var parts;
  if (window.Intl && Intl.Segmenter) {
    parts = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(compact), function (part) {
      return part.segment;
    });
  } else {
    parts = Array.from(compact);
  }
  return parts.filter(function (part) {
    return part && !/^[\uFE0E\uFE0F\u200D]+$/.test(part);
  });
}

async function fetchEmojis() {
  var candidates = ['Emojis.txt', '../Emojis.txt', '/Emojis.txt'];
  for (var i = 0; i < candidates.length; i++) {
    try {
      var response = await fetch(candidates[i], { cache: 'no-store' });
      if (!response.ok) continue;
      var parsed = splitEmojiText(await response.text());
      if (parsed.length) {
        emojis = parsed;
        return;
      }
    } catch (_) { }
  }
  emojis = FALLBACK_EMOJIS.slice();
}

function parseObjectPosition(pos) {
  var parts = String(pos || '50% 50%').trim().split(/\s+/);
  var x = 0.5;
  var y = 0.5;
  function parseVal(v, isX) {
    if (v === 'left') return 0;
    if (v === 'right') return 1;
    if (v === 'top') return 0;
    if (v === 'bottom') return 1;
    if (v === 'center') return 0.5;
    var n = parseFloat(v);
    if (!isNaN(n)) {
      if (/%$/.test(v)) return n / 100;
      return isX ? 0 : 0;
    }
    return 0.5;
  }
  if (parts.length === 1) {
    var p = parts[0];
    if (p === 'top') { x = 0.5; y = 0; }
    else if (p === 'bottom') { x = 0.5; y = 1; }
    else if (p === 'left') { x = 0; y = 0.5; }
    else if (p === 'right') { x = 1; y = 0.5; }
    else if (p === 'center') { x = 0.5; y = 0.5; }
    else if (/%$/.test(p)) { x = parseFloat(p) / 100; y = 0.5; }
    else { x = 0.5; y = 0.5; }
  } else if (parts.length >= 2) {
    x = parseVal(parts[0], true);
    y = parseVal(parts[1], false);
  }
  return { x: x, y: y };
}

function getRenderedImageBox(img, container) {
  var rect = container.getBoundingClientRect();
  var naturalWidth = img.naturalWidth || WHITEBOARD_SAFE_AREA.naturalWidth;
  var naturalHeight = img.naturalHeight || WHITEBOARD_SAFE_AREA.naturalHeight;
  var imageRatio = naturalWidth / naturalHeight;
  var boxRatio = rect.width / rect.height;
  var fit = window.getComputedStyle(img).objectFit || 'cover';
  var renderedWidth;
  var renderedHeight;

  if (fit === 'contain') {
    if (boxRatio > imageRatio) {
      renderedHeight = rect.height;
      renderedWidth = rect.height * imageRatio;
    } else {
      renderedWidth = rect.width;
      renderedHeight = rect.width / imageRatio;
    }
  } else {
    if (boxRatio > imageRatio) {
      renderedWidth = rect.width;
      renderedHeight = rect.width / imageRatio;
    } else {
      renderedHeight = rect.height;
      renderedWidth = rect.height * imageRatio;
    }
  }

  var pos = parseObjectPosition(window.getComputedStyle(img).objectPosition);

  return {
    left: (rect.width - renderedWidth) * pos.x,
    top: (rect.height - renderedHeight) * pos.y,
    width: renderedWidth,
    height: renderedHeight
  };
}

function positionLiveVideoOverWhiteboard() {
  var section = document.getElementById('live-video-section');
  if (!section) return;
  var bg = section.querySelector('.bg-image');
  var player = section.querySelector('.live-video-player');
  if (!bg || !player) return;

  var sectionRect = section.getBoundingClientRect();
  if (!sectionRect.width || !sectionRect.height) return;

  var imageBox = getRenderedImageBox(bg, section);
  var x = imageBox.left + imageBox.width * WHITEBOARD_SAFE_AREA.left;
  var y = imageBox.top + imageBox.height * WHITEBOARD_SAFE_AREA.top;
  var w = imageBox.width * WHITEBOARD_SAFE_AREA.width;
  var h = imageBox.height * WHITEBOARD_SAFE_AREA.height;

  var isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  var priority = isMobile ? 'important' : '';
  player.style.setProperty('left', x + 'px', priority);
  player.style.setProperty('top', y + 'px', priority);
  player.style.setProperty('width', w + 'px', priority);
  player.style.setProperty('height', h + 'px', priority);
}

function generateRandomIndianName() {
  var firstNames = ['Rahul', 'Priya', 'Amit', 'Neha', 'Arjun', 'Kavya', 'Siddharth', 'Anjali', 'Vikram', 'Meera', 'Rohan', 'Pooja', 'Karthik', 'Deepika', 'Aditya', 'Swathi'];
  var lastNames = ['Sharma', 'Singh', 'Kumar', 'Devi', 'Reddy', 'Patel', 'Yadav', 'Mehta', 'Iyer', 'Nair', 'Rao', 'Gupta', 'Joshi', 'Bose', 'Mishra', 'Pillai'];
  return firstNames[Math.floor(Math.random() * firstNames.length)] + ' ' + lastNames[Math.floor(Math.random() * lastNames.length)];
}

function triggerFlyingEmoji(emoji) {
  var container = document.getElementById('flying-emojis-container');
  if (!container) return;
  var el = document.createElement('div');
  el.className = 'flying-emoji';
  el.textContent = emoji;
  el.style.left = (72 + Math.random() * 23) + '%';
  el.style.top = (84 + Math.random() * 10) + '%';
  el.style.opacity = '1';
  container.appendChild(el);

  var duration = 3 + Math.random() * 2.5;
  var drift = -20 - Math.random() * 80;
  var rise = container.getBoundingClientRect().height * (0.95 + Math.random() * 0.4);
  requestAnimationFrame(function () {
    el.style.transition = 'transform ' + duration + 's linear, opacity ' + duration + 's ease-in';
    el.style.transform = 'translate3d(' + drift + 'px, -' + rise + 'px, 0) scale(' + (0.8 + Math.random() * 0.7) + ')';
    el.style.opacity = '0';
  });
  setTimeout(function () { el.remove(); }, duration * 1000 + 150);
}

function addHoverComment(username, text) {
  var section = document.getElementById('live-video-section');
  if (!section) return;
  var el = document.createElement('div');
  el.className = 'hover-comment';
  el.innerHTML = '<strong>' + escapeHtml(username) + ':</strong> ' + escapeHtml(text);
  el.style.left = (12 + Math.random() * 8) + 'px';
  var isMobile = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  if (isMobile) {
    el.style.bottom = (90 + Math.random() * 30) + 'px';
  } else {
    el.style.bottom = (14 + Math.random() * 18) + 'px';
  }
  section.appendChild(el);
  requestAnimationFrame(function () {
    el.style.transition = 'transform 3.5s ease-out, opacity 0.4s ease-out';
    el.style.opacity = '0.86';
    el.style.transform = 'translateY(-34px)';
  });
  setTimeout(function () {
    el.style.opacity = '0';
    setTimeout(function () { el.remove(); }, 500);
  }, 3600);
  // Also add to the panel when it's visible
  if (panelIsVisible) {
    addCommentToDisplay(username, text, false);
  }
}

function updateLiveCommentCount() {
  var countEl = document.getElementById('live-comments-count');
  if (countEl) countEl.textContent = liveCommentsCount;
}

function addCommentToDisplay(username, commentText, fromUser, isFlyingEmoji, emojiCode) {
  var commentList = document.getElementById('comment-list');
  if (!commentList) return;
  var item = document.createElement('div');
  item.className = 'live-comment-item' + (fromUser ? ' user-comment' : '');
  var displayText = commentText || (isFlyingEmoji ? 'Sent a ' + emojiCode : '');
  item.innerHTML = '<span class="live-comment-username">' + escapeHtml(username) + '</span> ' + escapeHtml(displayText);
  commentList.appendChild(item);
  commentList.scrollTop = commentList.scrollHeight;
  liveCommentsCount++;
  updateLiveCommentCount();
}

function toggleLiveComments() {
  var panel = document.getElementById('live-comments-display');
  if (!panel) return;
  panelIsVisible = !panel.classList.contains('active');
  panel.classList.toggle('active');
}

async function sendLiveComment() {
  var input = document.getElementById('live-comment-input-field');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;

  var client = getSupabaseClient();
  if (!client) return showLiveToast('Cloud connection is not ready yet.', 'error');

  var sendBtn = document.querySelector('.live-send-btn');
  if (sendBtn) sendBtn.disabled = true;
  try {
    var userResult = await client.auth.getUser();
    var user = userResult && userResult.data ? userResult.data.user : null;
    if (!user) {
      showLiveToast('Please sign in to comment.', 'error');
      return;
    }
    var username = (user.user_metadata && user.user_metadata.username) || user.email.split('@')[0];

    var mediaId = await getMediaId(client);
    var payload = {
      user_id: user.id,
      author_name: username,
      comment: text,
      is_approved: false
    };
    if (mediaId) {
      payload.media_id = mediaId;
    }

    try {
      var insertResult = await client.from('live_comments').insert(payload);
      if (insertResult.error) throw insertResult.error;
    } catch (_) { }

    input.value = '';
    // Always add to the comment list in the DOM, but its visibility is controlled by panel state
    addCommentToDisplay(username, text, true);
    // Always trigger hover animation
    addHoverComment(username, text);
    showLiveToast('Comment sent for admin approval.');
  } catch (err) {
    console.error('sendLiveComment error:', err);
    showLiveToast(err.message || 'Could not send comment.', 'error');
  } finally {
    if (sendBtn) sendBtn.disabled = false;
  }
}

async function sendFlyingEmoji() {
  if (!emojis.length) emojis = FALLBACK_EMOJIS.slice();
  var client = getSupabaseClient();
  var emoji = emojis[Math.floor(Math.random() * emojis.length)];
  // Trigger animation locally — no DB insert for emojis
  triggerFlyingEmoji(emoji);
}

function toggleLiveLike(btn) {
  if (!btn || likedOnce) return;
  likedOnce = true;
  liveLikes++;
  var countEl = document.getElementById('live-likes-count');
  if (countEl) countEl.textContent = liveLikes;
  btn.classList.add('liked');
  for (var i = 0; i < 5; i++) {
    setTimeout(function () {
      triggerFlyingEmoji(emojis.length ? emojis[Math.floor(Math.random() * emojis.length)] : '❤️');
    }, i * 150);
  }
}

async function loadWhiteboardVideo(client) {
  try {
    var query = client.from('whiteboard_videos').select('video_url').order('created_at', { ascending: false }).limit(1);
    var result = typeof query.maybeSingle === 'function' ? await query.maybeSingle() : await query.single();
    if (!result.error && result.data && result.data.video_url) {
      liveStreamUrl = result.data.video_url;
      var vid = document.getElementById('live-stream-video');
      if (vid) vid.src = liveStreamUrl;
    }
  } catch (err) {
    console.warn('No whiteboard video set yet.', err);
  }
}

async function loadLiveStreamOverride(client) {
  try {
    var res = await client.from('live_stream_status').select('is_active, stream_url').limit(1).maybeSingle();
    if (!res.error && res.data && res.data.is_active && res.data.stream_url) {
      liveStreamUrl = res.data.stream_url;
      var vid = document.getElementById('live-stream-video');
      if (vid) vid.src = liveStreamUrl;
    }
  } catch (err) {
    console.warn('Live stream override unavailable.', err);
  }
}

async function loadApprovedLiveComments(client) {
  try {
    var res = await client.from('live_comments')
      .select('author_name, comment, is_flying_emoji, emoji_code')
      .order('created_at', { ascending: true })
      .limit(20);
    if (res.error || !res.data) return;
    res.data.forEach(function (cm) {
      if (cm.is_flying_emoji) triggerFlyingEmoji(cm.emoji_code || '❤️');
      else addCommentToDisplay(cm.author_name || cm.username || 'Anonymous', cm.comment, false);
    });
  } catch (err) {
    console.warn('Could not load approved live comments.', err);
  }
}

function startRandomLiveActivity() {
  // Flying emojis
  setInterval(function () {
    var section = document.getElementById('live-video-section');
    if (emojis.length > 0 && section && section.offsetParent !== null) {
      triggerFlyingEmoji(emojis[Math.floor(Math.random() * emojis.length)]);
    }
  }, 700);

  // Fast continuous hover comments — 3 rapid cascading comments every ~1.8s
  function spawnHoverBatch() {
    var section = document.getElementById('live-video-section');
    if (!section || section.offsetParent === null) return;
    for (var i = 0; i < 3; i++) {
      (function (idx) {
        setTimeout(function () {
          var name = generateRandomIndianName();
          var msg = RANDOM_COMMENTS[Math.floor(Math.random() * RANDOM_COMMENTS.length)];
          addHoverComment(name, msg);
        }, idx * 600);
      })(i);
    }
  }

  liveHoverInterval = setInterval(spawnHoverBatch, 1800);
  // Initial burst
  setTimeout(spawnHoverBatch, 900);
}

document.addEventListener('DOMContentLoaded', async function () {
  var section = document.getElementById('live-video-section');
  if (!section) return;
  var bg = section.querySelector('.bg-image');
  if (bg) {
    if (bg.complete) positionLiveVideoOverWhiteboard();
    bg.addEventListener('load', positionLiveVideoOverWhiteboard, { once: true });
  }
  window.addEventListener('resize', positionLiveVideoOverWhiteboard);
  if (window.ResizeObserver) {
    window.liveVideoResizeObserver = new ResizeObserver(positionLiveVideoOverWhiteboard);
    window.liveVideoResizeObserver.observe(section);
  }
  await fetchEmojis();
  positionLiveVideoOverWhiteboard();
  startRandomLiveActivity();

  var client = getSupabaseClient();
  if (!client) return;
  await loadWhiteboardVideo(client);
  await loadLiveStreamOverride(client);
  await loadApprovedLiveComments(client);

  client.channel('live-comments-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_comments' }, function (payload) {
      var cm = payload.new;
      if (!cm) return;
      // Skip user comments — they're handled immediately by sendLiveComment()
      if (cm.is_user_comment) return;
      if (!cm.is_approved) return;
      if (cm.is_flying_emoji) triggerFlyingEmoji(cm.emoji_code || '❤️');
      else {
        addCommentToDisplay(cm.author_name || cm.username || 'Anonymous', cm.comment, false);
        addHoverComment(cm.author_name || cm.username, cm.comment);
      }
    })
    .subscribe();
});

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.toggleLiveComments = toggleLiveComments;
window.sendLiveComment = sendLiveComment;
window.sendFlyingEmoji = sendFlyingEmoji;
window.toggleLiveLike = toggleLiveLike;
