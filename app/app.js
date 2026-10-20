// Stories – Post to TikTok (demo UI). Talks to the Stories backend; the backend holds all secrets and tokens.
const BACKEND = (new URLSearchParams(location.search).get('backend')) || 'http://localhost:8787';
const $ = id => document.getElementById(id);
const PRIVACY_LABELS = {PUBLIC_TO_EVERYONE:'Everyone', MUTUAL_FOLLOW_FRIENDS:'Friends', FOLLOWER_OF_CREATOR:'Followers', SELF_ONLY:'Only me'};
const MUC = '<a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noopener">Music Usage Confirmation</a>';
const BCP = '<a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noopener">Branded Content Policy</a>';
let creator = null, video = null, durationOk = false;

async function call(path, opts={}) {
  const r = await fetch(BACKEND + path, {method: opts.body ? 'POST' : (opts.method||'GET'),
    headers: opts.body ? {'Content-Type':'application/json'} : {}, body: opts.body ? JSON.stringify(opts.body) : undefined});
  return r.json();
}
function show(id, on=true){ $(id).hidden = !on; }
function err(msg){ $('err').textContent = msg; show('err', !!msg); }

async function init() {
  try { await call('/api/health'); }
  catch(e) { err('Cannot reach the Stories posting service at ' + BACKEND + '. Make sure it is running, then reload.'); return; }
  const p = new URLSearchParams(location.search);
  if (p.get('code') && p.get('state')) {
    $('backend-note').textContent = 'Finishing sign-in…';
    const r = await call('/api/exchange', {body:{code:p.get('code'), state:p.get('state')}});
    history.replaceState(null, '', location.pathname);
    $('backend-note').textContent = '';
    if (!r.ok) { err('Sign-in failed: ' + (r.error_description || r.error || 'unknown error') + '. Please try again.'); }
  } else if (p.get('error')) {
    err('Sign-in was cancelled or failed: ' + (p.get('error_description') || p.get('error')));
    history.replaceState(null, '', location.pathname);
  }
  const s = await call('/api/session');
  if (!s.signed_in) { show('s-login'); return; }
  await loadAccount();
}

$('btn-login').onclick = async () => { const r = await call('/api/login_url'); location.href = r.url; };
$('btn-logout').onclick = async () => { await call('/api/logout', {body:{}}); location.reload(); };

async function loadAccount() {
  show('s-login', false);
  const ci = await call('/api/creator_info', {body:{}});
  if (!ci.error || ci.error.code !== 'ok') {
    show('s-account');
    $('acc-name').textContent = 'Your TikTok account';
    const msg = (ci.error && ci.error.code === 'spam_risk_too_many_posts') ? 'You have reached the posting limit for now.'
              : (ci.error && ci.error.code === 'spam_risk_user_banned_from_posting') ? 'This account cannot post right now.'
              : 'TikTok says this account cannot post at the moment.';
    $('acc-blocked').textContent = msg + ' Please try again later.'; show('acc-blocked');
    return;  // stop the publishing attempt
  }
  creator = ci.data;
  $('acc-avatar').src = creator.creator_avatar_url || '';
  $('acc-name').textContent = creator.creator_nickname || '';
  $('acc-user').textContent = creator.creator_username ? '@' + creator.creator_username : '';
  show('s-account');
  // privacy options straight from creator_info, no default selected
  const sel = $('privacy');
  (creator.privacy_level_options || []).forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = PRIVACY_LABELS[v] || v; sel.appendChild(o); });
  // interaction toggles: off by default, disabled + greyed if creator_info says so
  [['comment','comment_disabled'],['duet','duet_disabled'],['stitch','stitch_disabled']].forEach(([k,f]) => {
    const el = $('allow-' + k); el.checked = false;
    if (creator[f]) { el.disabled = true; el.parentElement.classList.add('disabled'); el.parentElement.title = 'Turned off in your TikTok settings'; }
  });
  video = await call('/api/video');
  $('preview').src = video.preview_url;
  $('title').value = video.caption; $('title-n').textContent = video.caption.length;
  $('aigc').checked = !!video.is_aigc;
  const max = creator.max_video_post_duration_sec;
  durationOk = video.duration_sec <= max;
  $('dur').textContent = `Length ${video.duration_sec.toFixed(1)} s · your account allows up to ${max} s`;
  if (!durationOk) { $('dur-warn').textContent = 'This video is longer than your account allows, so it can’t be posted.'; show('dur-warn'); }
  show('s-compose'); refresh();
}

function refresh() {
  const priv = $('privacy').value, com = $('commercial').checked, yb = $('your-brand').checked, bc = $('branded').checked;
  show('commercial-opts', com);
  if (!com) { $('your-brand').checked = false; $('branded').checked = false; }
  const ybOn = com && $('your-brand').checked, bcOn = com && $('branded').checked;
  // branded content can't be private
  const selfOpt = [...$('privacy').options].find(o => o.value === 'SELF_ONLY');
  if (selfOpt) { selfOpt.disabled = bcOn; selfOpt.title = bcOn ? 'Branded content visibility cannot be set to private.' : ''; }
  $('branded').disabled = (priv === 'SELF_ONLY');
  $('bc-wrap').classList.toggle('disabled', priv === 'SELF_ONLY');
  $('bc-wrap').title = priv === 'SELF_ONLY' ? 'Branded content visibility cannot be set to private.' : '';
  show('bc-note', com && priv === 'SELF_ONLY');
  $('privacy-note').textContent = bcOn ? 'Branded content visibility cannot be set to private.' : '';
  // label prompts
  if (bcOn) { $('label-prompt').textContent = "Your video will be labeled as 'Paid partnership'"; show('label-prompt'); }
  else if (ybOn) { $('label-prompt').textContent = "Your video will be labeled as 'Promotional content'"; show('label-prompt'); }
  else show('label-prompt', false);
  // consent line
  $('consent').innerHTML = bcOn ? `By posting, you agree to TikTok's ${BCP} and ${MUC}.` : `By posting, you agree to TikTok's ${MUC}.`;
  // post button
  let why = '';
  if (!priv) why = 'Choose who can view this video.';
  else if (com && !ybOn && !bcOn) why = 'You need to indicate if your content promotes yourself, a third party, or both.';
  else if (!durationOk) why = 'This video is longer than your account allows.';
  $('btn-post').disabled = !!why; $('post-wrap').title = why;
}
['privacy','commercial','your-brand','branded'].forEach(id => $(id).addEventListener('change', refresh));
$('title').addEventListener('input', () => $('title-n').textContent = $('title').value.length);

async function startPost(inbox) {
  err('');
  $('btn-post').disabled = true; $('btn-inbox').disabled = true;
  const body = inbox ? {} : {
    title: $('title').value, privacy_level: $('privacy').value,
    allow_comment: $('allow-comment').checked, allow_duet: $('allow-duet').checked, allow_stitch: $('allow-stitch').checked,
    commercial_on: $('commercial').checked, brand_organic_toggle: $('commercial').checked && $('your-brand').checked,
    brand_content_toggle: $('commercial').checked && $('branded').checked, is_aigc: $('aigc').checked };
  const r = await call(inbox ? '/api/inbox' : '/api/post', {body});
  if (!r.publish_id) { err((r.message || (r.error && (r.error.message || r.error.code)) || 'Posting failed') + ''); $('btn-inbox').disabled = false; refresh(); return; }
  show('s-compose', false); show('s-status');
  $('status-msg').textContent = inbox
    ? 'Sending your video to your TikTok inbox. When it arrives, open the TikTok app to finish and post it. This can take a few minutes.'
    : 'Your video is being posted. It may take a few minutes for it to process and appear on your TikTok profile.';
  poll(r.publish_id, inbox);
}
$('btn-post').onclick = () => startPost(false);
$('btn-inbox').onclick = () => startPost(true);
$('btn-again').onclick = () => location.reload();

const NICE = {PROCESSING_UPLOAD:'Uploading to TikTok…', PROCESSING_DOWNLOAD:'TikTok is fetching the video…', SEND_TO_USER_INBOX:'Sent to your TikTok inbox ✓ Open the TikTok app to finish posting.', PUBLISH_COMPLETE:'Posted ✓ It may take a few minutes to appear on your profile.', FAILED:'Posting failed'};
async function poll(pid, inbox, n=0) {
  const s = await call('/api/status?publish_id=' + encodeURIComponent(pid));
  const st = s.data && s.data.status;
  const line = st ? (NICE[st] || st) + (s.data.fail_reason ? ' (' + s.data.fail_reason + ')' : '') : (s.upload === 'pending' ? 'Uploading video…' : (s.error && s.error.message) || 'Waiting…');
  const log = $('status-log'); if (!log.lastChild || log.lastChild.textContent !== line) { const li = document.createElement('li'); li.textContent = line; log.appendChild(li); }
  if (s.upload === 'error') { err('Upload failed: ' + s.upload_error); show('btn-again'); return; }
  if (st === 'PUBLISH_COMPLETE' || st === 'FAILED' || st === 'SEND_TO_USER_INBOX') { $('status-msg').textContent = NICE[st] + (s.data.fail_reason ? ': ' + s.data.fail_reason : ''); show('btn-again'); return; }
  if (n < 120) setTimeout(() => poll(pid, inbox, n+1), 5000);
}
init();
