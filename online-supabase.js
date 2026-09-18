// online-supabase.js
// 三山勝負：オンライン対戦（部屋作成・参加のロビー機能のみ）
// index.html からは <script type="module" src="online-supabase.js"></script> で読み込まれます。
//
// ここでは Publishable(anon) key だけを使います。service_role key は絶対にここへ書かないでください。
 
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
 
const SUPABASE_URL = "https://oylrrjwwopsqxlvuknth.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_PUBLISHABLE_ANON_KEY_HERE"; // ← Project Settings > Data API の anon/publishable key に置き換えてください
 
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 
let currentChannel = null;
 
async function ensureAnonSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}
 
async function invokeFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message || String(error);
    try {
      // Edge Functionが返したJSONエラーメッセージがあれば拾う
      const ctx = error.context;
      if (ctx && typeof ctx.json === "function") {
        const j = await ctx.json();
        if (j && j.error) msg = j.error;
      }
    } catch (_e) { /* ignore */ }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}
 
function subscribeToGame(gameId) {
  unsubscribeGame();
 
  // 初回の状態取得（RLSにより自分が参加者である行だけ取得できる）
  supabase.from("games").select("*").eq("id", gameId).maybeSingle()
    .then(({ data, error }) => {
      if (!error && data && window.__online) window.__online.onGameRow(data);
    });
 
  // 以降の変化をRealtimeで購読
  currentChannel = supabase
    .channel("game:" + gameId)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: "id=eq." + gameId },
      (payload) => { if (window.__online) window.__online.onGameRow(payload.new); }
    )
    .subscribe();
}
 
function unsubscribeGame() {
  if (currentChannel) {
    supabase.removeChannel(currentChannel);
    currentChannel = null;
  }
}
 
window.OnlineSupabase = {
  async createRoom({ name, difficulty }) {
    await ensureAnonSession();
    const data = await invokeFn("create-game", { name, difficulty });
    subscribeToGame(data.game_id);
    return data;
  },
  async joinRoom({ name, room_code }) {
    await ensureAnonSession();
    const data = await invokeFn("join-game", { name, room_code });
    subscribeToGame(data.game_id);
    return data;
  },
  unsubscribeGame
};
 