/* =========================================================================
   PIXEL ARCADE — Chat safety: profanity filter + Report + Block
   Loaded by index.html and arcade.html AFTER the main script, with:
       <script src="/chat-moderation.js" defer></script>
   It replaces sendChatMessage() and renderChatMessages() with safe versions.
   - Bad words are masked (****) before sending and again when displayed.
   - Every message from the other player gets Report and Block buttons.
   - Block hides that player's messages on this device (saved locally).
   - Report saves the message to Firestore "reports" (read it in the Firebase
     Console) and also blocks that player.
   ========================================================================= */
(function(){
  'use strict';

  var BLOCK_KEY = 'arcade_blocked_uids_v1';

  /* ---------- profanity filter ---------- */
  // Matched anywhere inside a word.
  var STRONG = [
    'fuck','shit','bitch','asshole','bastard','whore','slut','nigg',
    'retard','motherfuck','dickhead','pussy','cocksuck','blowjob',
    'madarchod','bhenchod','behenchod','chutiya','gandu'
  ];
  // Matched only as whole words (short words that appear inside normal words).
  var WHOLE = ['cunts?','dick','cock','fag','faggot','porn','rape','rapist','cum','kys','tits'];
  // Phrases.
  var PHRASES = [/kill\s*y(?:our|o)?\s*self/g];

  var strongRe = new RegExp('(?:' + STRONG.join('|') + ')', 'g');
  var wholeRe = new RegExp('\\b(?:' + WHOLE.join('|') + ')\\b', 'g');

  function normalize(s){
    // Same length as the original so match positions line up.
    return s.toLowerCase()
      .replace(/[@4]/g,'a').replace(/0/g,'o').replace(/[1!|]/g,'i')
      .replace(/3/g,'e').replace(/[$5]/g,'s').replace(/7/g,'t');
  }
  function mask(text){
    var original = String(text == null ? '' : text);
    var norm = normalize(original);
    var chars = original.split('');
    function run(re){
      re.lastIndex = 0;
      var m;
      while((m = re.exec(norm)) !== null){
        if(m[0].length === 0){ re.lastIndex++; continue; }
        for(var i = m.index; i < m.index + m[0].length; i++) chars[i] = '*';
      }
    }
    run(strongRe); run(wholeRe);
    for(var p = 0; p < PHRASES.length; p++) run(PHRASES[p]);
    return chars.join('');
  }
  window.ArcadeChatMask = mask;

  /* ---------- block list ---------- */
  function getBlocked(){
    try{ return JSON.parse(localStorage.getItem(BLOCK_KEY) || '[]'); }catch(e){ return []; }
  }
  function saveBlocked(list){
    try{ localStorage.setItem(BLOCK_KEY, JSON.stringify(list)); }catch(e){}
  }
  function isBlocked(uid){ return !!uid && getBlocked().indexOf(uid) !== -1; }
  function blockUid(uid){
    if(!uid) return;
    var list = getBlocked();
    if(list.indexOf(uid) === -1){ list.push(uid); saveBlocked(list); }
  }

  /* ---------- small helpers ---------- */
  var lastMsgs = [];
  var lastRole = null;

  function esc(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function toast(text){
    var t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);' +
      'background:#111827;color:#fff;padding:9px 14px;border-radius:8px;font-size:13px;' +
      'z-index:99999;max-width:80vw;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.4);';
    document.body.appendChild(t);
    setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }
  function sendReport(m){
    try{
      if(typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED &&
         typeof fbDB !== 'undefined' && fbDB){
        fbDB.collection('reports').add({
          type: 'chat',
          room: (typeof OnlineRoom !== 'undefined' && OnlineRoom.getCode) ? (OnlineRoom.getCode() || null) : null,
          msgId: m.id || null,
          uid: m.uid || null,
          sender: m.sender || null,
          text: String(m.text || '').slice(0, 300),
          ts: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(e){ console.warn('report failed', e); });
      }
    }catch(e){ console.warn('report failed', e); }
  }

  /* ---------- panel extras (rules line + unblock link) ---------- */
  function ensureExtras(){
    var panel = document.getElementById('chat-panel');
    if(!panel) return;
    var bar = document.getElementById('chat-safety-bar');
    if(!bar){
      var row = panel.querySelector('.chat-input-row');
      if(!row) return;
      bar = document.createElement('div');
      bar.id = 'chat-safety-bar';
      bar.style.cssText = 'padding:4px 10px;font-size:10.5px;color:var(--text-dim);' +
        'border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:8px;';
      panel.insertBefore(bar, row);
      bar.addEventListener('click', function(e){
        if(e.target && e.target.id === 'chat-unblock-all'){
          saveBlocked([]);
          toast('Unblocked everyone');
          renderChatMessages(lastMsgs, lastRole);
        }
      });
    }
    var n = getBlocked().length;
    bar.innerHTML = '<span>Be kind. Report or block anyone who is rude.</span>' +
      (n ? '<a href="#" id="chat-unblock-all" onclick="return false;" style="color:var(--cyan);">Unblock all (' + n + ')</a>' : '');
  }

  function ensureLogHandler(){
    var log = document.getElementById('chat-log');
    if(!log || log.getAttribute('data-mod') === '1') return;
    log.setAttribute('data-mod', '1');
    log.addEventListener('click', function(e){
      var btn = e.target;
      if(!btn || !btn.getAttribute) return;
      var action = btn.getAttribute('data-act');
      if(!action) return;
      var id = btn.getAttribute('data-id');
      var m = null;
      for(var i = 0; i < lastMsgs.length; i++){ if(lastMsgs[i].id === id){ m = lastMsgs[i]; break; } }
      if(!m) return;
      if(action === 'report'){
        if(!window.confirm('Report this message and block this player?')) return;
        sendReport(m);
        blockUid(m.uid);
        toast('Reported and blocked. Thank you.');
      } else if(action === 'block'){
        if(!window.confirm('Block this player? You will not see their messages.')) return;
        blockUid(m.uid);
        toast('Player blocked');
      }
      renderChatMessages(lastMsgs, lastRole);
    });
  }

  /* ---------- replacement: render ---------- */
  function renderChatMessages(msgs, role){
    var log = document.getElementById('chat-log');
    if(!log) return;
    msgs = msgs || [];
    lastMsgs = msgs; lastRole = role;
    ensureLogHandler();
    ensureExtras();

    var newFromFriend = 0;
    msgs.forEach(function(m){
      if(!chatKnownIds.has(m.id)){
        chatKnownIds.add(m.id);
        if(m.sender && m.sender !== role && !isBlocked(m.uid)) newFromFriend++;
      }
    });

    log.innerHTML = msgs.map(function(m){
      var mine = m.sender === role;
      if(!mine && isBlocked(m.uid)) return '';
      var who = mine ? 'You' : 'Friend';
      var body = esc(mask(m.text || ''));
      var actions = '';
      if(!mine){
        var id = esc(m.id || '');
        actions = '<span style="display:block;margin-top:3px;font-size:10px;">' +
          '<a href="#" data-act="report" data-id="' + id + '" onclick="return false;" style="color:#ff6b6b;margin-right:10px;">Report</a>' +
          '<a href="#" data-act="block" data-id="' + id + '" onclick="return false;" style="color:var(--text-dim);">Block</a>' +
          '</span>';
      }
      return '<div class="chat-msg ' + (mine ? 'me' : 'them') + '"><span class="chat-who">' + who + '</span>' + body + actions + '</div>';
    }).join('');
    log.scrollTop = log.scrollHeight;

    if(newFromFriend > 0 && !chatOpen){
      chatUnread += newFromFriend;
      updateChatBadge();
    }
  }

  /* ---------- replacement: send ---------- */
  async function sendChatMessage(){
    var input = document.getElementById('chat-input');
    if(!input) return;
    var text = input.value;
    if(!text || !text.trim()) return;
    var btn = document.getElementById('chat-send-btn');
    if(btn) btn.disabled = true;
    input.value = '';
    var clean = mask(text);
    var ok = await OnlineRoom.sendChat(clean);
    if(btn) btn.disabled = false;
    if(!ok) input.value = text;
    input.focus();
  }

  window.renderChatMessages = renderChatMessages;
  window.sendChatMessage = sendChatMessage;
})();