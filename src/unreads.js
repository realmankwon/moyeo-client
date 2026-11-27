/* Server-backed unread and mention counts plus per-room notification levels. */
const unreads = (() => {
  // base: counts the server reported at the last sync. extra: posts seen since then.
  let members = new Map(), base = new Map(), extra = new Map(), grew = new Set(), status = '', loading = null;
  const empty = { count: 0, mentions: 0 };
  function apply(list) {
    const previous = base, next = new Map(), fresh = new Map(), raised = new Set();
    for (const member of Array.isArray(list) ? list : []) {
      const channel = state.channels.find(item => item.id === member.channel_id);
      if (!channel) continue;
      fresh.set(member.channel_id, member);
      const total = Number(channel.total_msg_count);
      const count = Number.isFinite(total) ? Math.max(0, total - member.msg_count) : 0, mentions = Math.max(0, member.mention_count || 0);
      next.set(member.channel_id, { count, mentions });
      if (mentions > (previous.get(member.channel_id)?.mentions || 0) + (extra.get(member.channel_id)?.mentions || 0)) raised.add(member.channel_id);
    }
    members = fresh; base = next; extra = new Map(); grew = raised;
  }
  function load() {
    if (!state.me || state.demo || isFloating || !api?.channelMembers) return Promise.resolve();
    if (loading) return loading;
    const epoch = state.generation;
    const task = api.channelMembers().then(list => { if (epoch === state.generation) apply(list); }).catch(() => { grew = new Set(); }).finally(() => { if (loading === task) loading = null; });
    loading = task; return task;
  }
  function counts(id) {
    const saved = base.get(id) || empty, added = extra.get(id) || empty;
    return { count: saved.count + added.count, mentions: saved.mentions + added.mentions };
  }
  function bump(id, mentioned) {
    const added = extra.get(id) || empty;
    extra.set(id, { count: added.count + 1, mentions: added.mentions + (mentioned ? 1 : 0) });
  }
  function clear(id) {
    const had = counts(id).count > 0 || counts(id).mentions > 0;
    base.set(id, { count: 0, mentions: 0 }); extra.delete(id); grew.delete(id);
    return had;
  }
  function read(id, time) {
    const channel = state.channels.find(item => item.id === id);
    if (channel && time >= (channel.last_post_at || 0) && clear(id) && $('#channel-list')) renderChannelList();
  }
  function level(id) {
    const props = members.get(id)?.notify_props;
    if (!props) return 'all';
    if (props.mark_unread === 'mention' || props.desktop === 'none') return 'mute';
    return props.desktop === 'mention' ? 'mention' : 'all';
  }
  async function setLevel(id, value) {
    const props = await api.setChannelNotify(id, value);
    const member = members.get(id) || { channel_id: id, msg_count: 0, mention_count: 0 };
    members.set(id, { ...member, notify_props: props });
    if ($('#channel-list')) renderChannelList();
  }
  // Whether a new post in this room should raise the banner, sound and OS notification.
  function alerts(channel, mentioned) {
    const value = level(channel.id);
    if (value === 'mute') return false;
    return value === 'all' || channel.type === 'D' || mentioned || grew.has(channel.id);
  }
  function badge(id) {
    const { count, mentions } = counts(id), legacy = state.unread[id];
    if (!count && !mentions && !legacy) return '';
    const muted = level(id) === 'mute', number = count || mentions;
    const text = number ? (number > 99 ? '99+' : String(number)) : String(legacy);
    const label = mentions ? `멘션 ${mentions}개 · 안 읽은 메시지 ${number}개` : number ? `안 읽은 메시지 ${number}개` : '새 메시지';
    return `<span class="badge${mentions ? ' badge-mention' : ''}${muted ? ' badge-muted' : ''}" title="${esc(label)}" aria-label="${esc(label)}">${mentions ? '@ ' : ''}${esc(text)}</span>`;
  }
  const any = id => { const value = counts(id); return value.count > 0 || value.mentions > 0; };
  const quiet = () => status === 'dnd';
  async function loadStatus() {
    if (!state.me || state.demo || isFloating || !api?.myStatus) return;
    const epoch = state.generation;
    try { const value = await api.myStatus(); if (epoch === state.generation) status = value; } catch { /* Status may be hidden by server policy. */ }
  }
  function reset() { members = new Map(); base = new Map(); extra = new Map(); grew = new Set(); status = ''; loading = null; }
  window.messenger?.onRealtime(event => { if (event.type === 'status') status = event.status; });
  return { load, loadStatus, counts, bump, clear, read, level, setLevel, alerts, badge, any, quiet, reset };
})();
