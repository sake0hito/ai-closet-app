import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

// =============================================
// Firebase 初期化
// =============================================
const firebaseConfig = {
    apiKey: "AIzaSyB4pJZmXY4Rq2ZCHXTJeQo5xmfJpGW9dm4",
    authDomain: "ai-closet-d7dd5.firebaseapp.com",
    projectId: "ai-closet-d7dd5",
    storageBucket: "ai-closet-d7dd5.firebasestorage.app",
    messagingSenderId: "251201592970",
    appId: "1:251201592970:web:6b7de7fab25339a1c29773"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// =============================================
// 定数
// =============================================
const GOOGLE_CLIENT_ID = "129220662304-ep6hsfq62ftri0kcirnv647sbnt0gk73.apps.googleusercontent.com";
// Cloudflare Workers プロキシ URL
const WORKER_URL = 'https://ai-closet-gemini.liyuandagui80.workers.dev';

const CATEGORIES = {
    "トップス・アウター": ["カットソー", "Tシャツ", "タンクトップ", "シャツ", "ブラウス", "スウェット", "パーカ", "ニット/セーター", "カーディガン", "ジャケット"],
    "ボトムス": ["デニム", "チノパン", "カーゴパンツ", "スラックス", "ショートパンツ", "クロップパンツ", "バミューダパンツ", "カプリパンツ", "スキニーパンツ", "サルエルパンツ", "テーパードパンツ", "ワイドパンツ", "ガウチョパンツ", "バギーパンツ", "その他のボトムス"],
    "帽子": ["ハット", "キャップ", "ニット帽", "その他の帽子"],
    "靴": ["スニーカー", "革靴", "ブーツ", "サンダル", "パンプス", "フラットシューズ"],
    "ワンピース": [],
    "ドレス": [],
    "スーツ": []
};
const COLORS = ["赤", "青", "黄", "緑", "むらさき", "ピンク", "オレンジ", "ベージュ", "グレー", "黒", "白"];
const STYLES = ["カジュアル系", "きれいめ（シンプル）系", "エレガント系", "クール系", "フォーマル系", "ストリート系", "フェミニン・ガーリー系", "アウトドア系", "アメカジ系"];
const SEASONS = ["春", "夏", "秋", "冬", "オールシーズン"];
const CHART_COLORS = ['#0ea5e9','#f59e0b','#10b981','#f43f5e','#8b5cf6','#06b6d4','#ec4899','#f97316','#84cc16'];

// =============================================
// アプリ状態
// =============================================
let currentUser = null;
let googleTokenClient;
let isCalendarConnected = localStorage.getItem('google_calendar_connected') === 'true';
let calendarEvents = {};

// 位置情報（localStorageにのみ保存、Firebaseには送らない）
let userLocation = (() => {
    try { return JSON.parse(localStorage.getItem('user_location') || 'null'); }
    catch { return null; }
})();

let weeklyOutfits = Array(7).fill(null).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i);
    return {
        dateObj: d,
        dateStr: d.toLocaleDateString('ja-JP', {month:'short', day:'numeric', weekday:'short'}),
        isoDate: d.toISOString().split('T')[0],
        temp: "--°C", condition: "--", icon: "loader", event: null,
        title: i === 0 ? "今日のAIコーデ" : (i === 1 ? "明日のAIコーデ" : `${d.getDate()}日のAIコーデ`),
        image: `https://images.unsplash.com/photo-${1500000000000 + i * 100000}?auto=format&fit=crop&w=400&q=80`,
        tags: [STYLES[Math.floor(Math.random()*STYLES.length)].replace('系',''), SEASONS[Math.floor(Math.random()*SEASONS.length)]],
        reason: "データ取得中..."
    };
});

let closetItems = [];
let wearHistory = [];
let isDataLoaded = false;

let currentRoute = '';
let isEditMode = false;
let selectedItems = new Set();
let activeFilters = { category: [], subCategory: [], colors: [], styles: [], seasons: [], lightness: [] };
let coordState = { tops: null, bottoms: null };
let currentTargetSlot = null;
let currentEditData = {};
let styleChartInstance = null;

// チャット履歴（ページ内のみ保持）
let chatMessages = [
    { role: 'ai', text: 'こんにちは！AIスタイリストです 👗 クローゼットの情報を参考に、コーデのご提案ができます。気軽に話しかけてください！' }
];

// =============================================
// DOM参照
// =============================================
const mainContent = document.getElementById('main-content');
const headerTitle = document.getElementById('header-title');
const headerActions = document.getElementById('header-actions');
const navButtons = document.querySelectorAll('.nav-btn');
const fabAdd = document.getElementById('fab-add');
const modalContainer = document.getElementById('modal-container');
const nativeCameraInput = document.getElementById('native-camera-input');
const authOverlay = document.getElementById('auth-overlay');
const authError = document.getElementById('auth-error');

// =============================================
// Gemini AI API（Cloudflare Workers 経由）
// =============================================
async function callGemini(prompt, imageBase64 = null) {
    const base64Data = imageBase64
        ? imageBase64.replace(/^data:image\/\w+;base64,/, '')
        : null;

    const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageBase64: base64Data })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `APIエラー (${response.status})`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// =============================================
// 位置情報管理（プライバシー配慮: localStorageのみ、Firebase非保存）
// =============================================
async function reverseGeocode(lat, lon) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ja`,
            { headers: { 'User-Agent': 'AI-Closet-App/1.0' } }
        );
        const data = await res.json();
        return data.address?.state || data.address?.city || data.address?.town || '現在地';
    } catch {
        return '現在地';
    }
}

window.enableLocationWeather = function() {
    if (!navigator.geolocation) {
        alert('このブラウザは位置情報に対応していません。');
        return;
    }
    const btn = document.getElementById('btn-location');
    if (btn) { btn.textContent = '📡 現在地を取得中...'; btn.disabled = true; }

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            const name = await reverseGeocode(latitude, longitude);
            userLocation = { lat: latitude, lon: longitude, name };
            // ⚠️ localStorageにのみ保存（サーバー・Firebaseには一切送らない）
            localStorage.setItem('user_location', JSON.stringify(userLocation));
            await fetchWeather();
            navigate('settings');
        },
        (err) => {
            let msg = '位置情報の取得に失敗しました。';
            if (err.code === 1) msg = 'ブラウザの設定で位置情報のアクセスを許可してください。';
            else if (err.code === 3) msg = 'タイムアウトしました。もう一度お試しください。';
            alert(msg);
            navigate('settings');
        },
        { timeout: 12000, maximumAge: 3600000 } // 1時間キャッシュ
    );
};

window.disableLocationWeather = function() {
    userLocation = null;
    localStorage.removeItem('user_location');
    fetchWeather();
    navigate('settings');
};

// =============================================
// 認証
// =============================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        authOverlay.classList.add('hidden');
        fetchFirebaseData();
    } else {
        currentUser = null;
        isDataLoaded = false;
        closetItems = [];
        wearHistory = [];
        authOverlay.classList.remove('hidden');
    }
});

document.getElementById('btn-google-login').addEventListener('click', async () => {
    authError.textContent = "";
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch(e) { authError.textContent = "Googleログインに失敗しました: " + e.message; }
});

document.getElementById('btn-email-register').addEventListener('click', async () => {
    authError.textContent = "";
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    if (!email || !pass) { authError.textContent = "メールアドレスとパスワードを入力してください"; return; }
    try {
        await createUserWithEmailAndPassword(auth, email, pass);
    } catch(e) { authError.textContent = "登録エラー: " + e.message; }
});

document.getElementById('btn-email-login').addEventListener('click', async () => {
    authError.textContent = "";
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    if (!email || !pass) { authError.textContent = "メールアドレスとパスワードを入力してください"; return; }
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) { authError.textContent = "ログインエラー: " + e.message; }
});

window.logout = async function() {
    if (confirm("ログアウトしますか？")) {
        await signOut(auth);
        navigate('home');
    }
};

// =============================================
// Firebase データ取得
// =============================================
async function fetchFirebaseData() {
    if (!currentUser || isDataLoaded) return;
    try {
        const qCloset = query(collection(db, "closetItems"), where("userId", "==", currentUser.uid));
        const snapshot = await getDocs(qCloset);
        closetItems = [];
        snapshot.forEach((d) => { closetItems.push({ id: d.id, ...d.data() }); });
        closetItems.sort((a, b) => b.createdAt - a.createdAt);

        const qHistory = query(collection(db, "history"), where("userId", "==", currentUser.uid));
        const snapHistory = await getDocs(qHistory);
        wearHistory = [];
        snapHistory.forEach((d) => { wearHistory.push({ id: d.id, ...d.data() }); });
        wearHistory.sort((a, b) => b.createdAt - a.createdAt);

        isDataLoaded = true;
        if (currentRoute === 'closet' || currentRoute === 'history') navigate(currentRoute);
    } catch (e) {
        console.error("Firebase読み込みエラー:", e);
    }
}

// =============================================
// 天気・カレンダー
// =============================================
function updateWeeklyReasons() {
    weeklyOutfits.forEach(outfit => {
        const ev = calendarEvents[outfit.isoDate];
        outfit.reason = ev
            ? `予定「${ev}」と気温(${outfit.temp})に合わせて、${outfit.tags.join('・')}なコーデを提案します！`
            : `気温(${outfit.temp})に最適な${outfit.tags.join('・')}なコーデを選びました！`;
    });
    if (currentRoute === 'home') navigate('home');
}

function initGoogleAuth() {
    if (window.google) {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/calendar.readonly',
            callback: async (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    isCalendarConnected = true;
                    localStorage.setItem('google_calendar_connected', 'true');
                    try {
                        const timeMin = new Date().toISOString();
                        const timeMaxDate = new Date(); timeMaxDate.setDate(timeMaxDate.getDate() + 7);
                        const timeMax = timeMaxDate.toISOString();
                        const res = await fetch(
                            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
                            { headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` } }
                        );
                        const data = await res.json();
                        calendarEvents = {};
                        if (data.items) {
                            data.items.forEach(item => {
                                const d = item.start.dateTime || item.start.date;
                                const iso = d.split('T')[0];
                                if (!calendarEvents[iso]) calendarEvents[iso] = item.summary;
                            });
                        }
                        updateWeeklyReasons();
                    } catch(e) { console.error(e); }
                    alert("Googleカレンダーと連携しました！1週間の予定をコーデ提案に反映します。");
                    if (currentRoute === 'settings' || currentRoute === 'home') navigate(currentRoute);
                }
            },
        });
    }
}

// 天気取得（位置情報があればその座標を使用、なければ東京）
async function fetchWeather() {
    try {
        const lat = userLocation?.lat ?? 35.6895;
        const lon = userLocation?.lon ?? 139.6917;
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,weathercode&timezone=Asia%2FTokyo`
        );
        const data = await response.json();

        const parseWeather = (code) => {
            if (code === 0) return { c: "快晴", i: "sun" };
            if (code >= 1 && code <= 3) return { c: "曇り", i: "cloud" };
            if (code >= 45 && code <= 48) return { c: "霧", i: "cloud-fog" };
            if (code >= 51 && code <= 67) return { c: "雨", i: "cloud-rain" };
            if (code >= 71) return { c: "雪", i: "snowflake" };
            return { c: "晴れ", i: "sun" };
        };

        if (data.daily) {
            weeklyOutfits.forEach((outfit, index) => {
                if (index < data.daily.time.length) {
                    const w = parseWeather(data.daily.weathercode[index]);
                    outfit.temp = `${Math.round(data.daily.temperature_2m_max[index])}°C`;
                    outfit.condition = w.c;
                    outfit.icon = w.i;
                }
            });
            updateWeeklyReasons();
        }
    } catch (e) { console.error("天気API エラー:", e); }
}

// リアルタイム時計
setInterval(() => {
    const clockEl = document.getElementById('realtime-clock');
    const dateEl = document.getElementById('realtime-date');
    if (clockEl && dateEl) {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
        dateEl.textContent = now.toLocaleDateString('ja-JP', {month: 'short', day: 'numeric', weekday: 'short'});
    }
}, 1000);

// =============================================
// スタイル円グラフ（Chart.js）
// =============================================
function initStyleChart() {
    const canvas = document.getElementById('style-chart');
    if (!canvas) return;

    const styleCounts = {};
    closetItems.forEach(item => {
        (item.styles || []).forEach(s => {
            styleCounts[s] = (styleCounts[s] || 0) + 1;
        });
    });

    if (Object.keys(styleCounts).length === 0) {
        canvas.closest('.card')?.remove();
        return;
    }

    // 既存チャートを破棄
    if (styleChartInstance) {
        styleChartInstance.destroy();
        styleChartInstance = null;
    }

    const labels = Object.keys(styleCounts);
    const dataVals = labels.map(l => styleCounts[l]);

    styleChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: dataVals,
                backgroundColor: CHART_COLORS.slice(0, labels.length),
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.6)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { font: { size: 11 }, padding: 10 }
                }
            }
        }
    });
}

// =============================================
// AI チャット
// =============================================
window.sendQuickPrompt = function(prompt) {
    const input = document.getElementById('chat-input');
    if (input) { input.value = prompt; }
    sendChat();
};

window.sendChat = async function() {
    const input = document.getElementById('chat-input');
    const msg = input?.value?.trim();
    if (!msg) return;

    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    input.value = '';
    chatMessages.push({ role: 'user', text: msg });

    renderChatMessages(messagesEl);

    // ローディング追加
    const loadingId = 'chat-loading-' + Date.now();
    messagesEl.innerHTML += `<div class="chat-msg ai" id="${loadingId}"><i data-lucide="loader" class="spinner inline-icon"></i> 考え中...</div>`;
    lucide.createIcons();
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // クロゼット傾向サマリーを構築
    const styleCounts = {};
    closetItems.forEach(item => {
        (item.styles || []).forEach(s => { styleCounts[s] = (styleCounts[s] || 0) + 1; });
    });
    const styleStr = Object.entries(styleCounts).sort((a,b) => b[1]-a[1]).slice(0,3)
        .map(([k,v]) => `${k}(${v}点)`).join('、') || 'データなし';
    const todayWeather = weeklyOutfits[0];
    const locationName = userLocation?.name || '東京';

    const systemPrompt = `あなたはプロのファッションスタイリストAIです。ユーザーの手持ちの服と天気を考慮して、具体的で実用的なコーデアドバイスをします。回答は200文字以内、日本語、フレンドリーなトーンで。`;
    const contextStr = `クローゼット: ${closetItems.length}点。主なスタイル: ${styleStr}。今日の天気(${locationName}): ${todayWeather.temp}、${todayWeather.condition}。`;
    const fullPrompt = `${systemPrompt}\n\nコンテキスト: ${contextStr}\n\nユーザーの質問: ${msg}`;

    try {
        const response = await callGemini(fullPrompt);
        document.getElementById(loadingId)?.remove();
        if (response) {
            chatMessages.push({ role: 'ai', text: response });
            renderChatMessages(messagesEl);
        }
    } catch (e) {
        document.getElementById(loadingId)?.remove();
        const errMsg = `エラーが発生しました: ${e.message}`;
        chatMessages.push({ role: 'ai', text: errMsg });
        renderChatMessages(messagesEl);
    }
    lucide.createIcons();
    messagesEl.scrollTop = messagesEl.scrollHeight;
};

function renderChatMessages(container) {
    container.innerHTML = chatMessages.map(m =>
        `<div class="chat-msg ${m.role}">${m.text.replace(/\n/g, '<br>')}</div>`
    ).join('');
    lucide.createIcons();
    container.scrollTop = container.scrollHeight;
}


// =============================================
// ヘルパー
// =============================================
function formatTags(item) {
    let tags = [];
    if (item.subCategory) tags.push(item.subCategory);
    else if (item.category) tags.push(item.category);
    if (item.colors && item.colors.length > 0) tags.push(item.colors.join('・'));
    if (item.lightness && item.lightness !== '指定なし') tags.push(item.lightness);
    if (item.styles && item.styles.length > 0) {
        tags = tags.concat(item.styles.map(s => s.replace('系', '')));
    }
    return tags;
}

// =============================================
// ルート定義
// =============================================
const routes = {
    home: {
        title: "ホーム",
        showFab: false,
        render: () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
            const dateStr = now.toLocaleDateString('ja-JP', {month: 'short', day: 'numeric', weekday: 'short'});
            const todayWeather = weeklyOutfits[0];
            const locationName = userLocation?.name || '東京';

            let html = `
            <div style="text-align:center; margin-bottom:24px;">
                <div id="realtime-clock" class="clock-widget">${timeStr}</div>
                <div id="realtime-date" class="date-widget">${dateStr}</div>
                <div class="weather-widget" style="justify-content:center; margin-bottom:0;">
                    <i data-lucide="${todayWeather.icon}" class="weather-icon ${todayWeather.icon === 'loader' ? 'spinner' : ''}" style="width:36px; height:36px;"></i>
                    <div class="weather-info" style="text-align:left;">
                        <h2 style="font-size:1.5rem;">${todayWeather.temp}</h2>
                        <p style="margin-top:0;">${locationName} / ${todayWeather.condition}</p>
                    </div>
                </div>
            </div>

            <h3 class="section-title">1週間のコーデ予測</h3>
            <div class="carousel-container">
            `;

            weeklyOutfits.forEach((outfit, index) => {
                html += `
                <div class="carousel-item">
                    <div class="card outfit-card" onclick="openOutfitDetails(${index})">
                        <div style="padding:12px; font-weight:bold; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; justify-content:space-between;">
                            <span>${outfit.dateStr}</span>
                            <span style="color:var(--text-secondary); font-size:0.9rem;"><i data-lucide="${outfit.icon}" class="inline-icon"></i> ${outfit.temp}</span>
                        </div>
                        <img src="${outfit.image}" alt="Outfit" class="outfit-image" style="height:200px;" />
                        <div class="outfit-details">
                            <h4 class="mb-4">${outfit.title}</h4>
                            <div style="display:flex; flex-wrap:wrap; gap:4px;">${outfit.tags.map(tag => `<span class="tag-small">${tag}</span>`).join('')}</div>
                            <p class="mt-4" style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
                                <i data-lucide="sparkles" class="inline-icon" style="color: var(--accent-color);"></i>
                                ${outfit.reason}
                            </p>
                        </div>
                    </div>
                </div>
                `;
            });

            html += `</div>`;

            // コーデ検証ルーム
            html += `
            <h3 class="section-title mt-4">コーデ検証ルーム</h3>
            <div class="card">
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">手持ちの衣類を組み合わせてAIの評価を聞いてみよう！</p>
                <div class="coord-slots">
                    <div class="coord-slot" onclick="openCoordPicker('トップス・アウター')" id="slot-tops">
                        ${coordState.tops ? `<img src="${coordState.tops.image}"><div class="coord-slot-clear" onclick="event.stopPropagation(); clearCoord('tops')">✕</div>` : 'トップス未選択'}
                    </div>
                    <div class="coord-slot" onclick="openCoordPicker('ボトムス')" id="slot-bottoms">
                        ${coordState.bottoms ? `<img src="${coordState.bottoms.image}"><div class="coord-slot-clear" onclick="event.stopPropagation(); clearCoord('bottoms')">✕</div>` : 'ボトムス未選択'}
                    </div>
                </div>
                <button class="btn-outline mt-4" onclick="analyzeCoordination()">
                    <i data-lucide="sparkles" class="inline-icon" style="color:var(--accent-color);"></i>
                    この組み合わせをAIで分析する
                </button>
                <div id="coord-result" class="hidden mt-4" style="background:var(--primary-light); padding:16px; border-radius:8px; font-size:0.9rem; line-height:1.5;"></div>
            </div>
            `;

            // AIチャット
            html += `
            <h3 class="section-title mt-4">💬 AIスタイリストに相談</h3>
            <div class="card" style="padding:16px;">
                <div class="quick-prompts">
                    <button class="quick-prompt-btn" onclick="sendQuickPrompt('今日の天気に合うコーデを提案して')">今日の天気×コーデ</button>
                    <button class="quick-prompt-btn" onclick="sendQuickPrompt('明日のコーデを提案して')">明日のコーデ</button>
                    <button class="quick-prompt-btn" onclick="sendQuickPrompt('私のクローゼットのスタイル傾向を教えて')">傾向分析</button>
                </div>
                <div class="chat-messages" id="chat-messages"></div>
                <div style="display:flex; gap:8px;">
                    <input type="text" id="chat-input" class="input-field" placeholder="例：カジュアルなコーデが知りたい" style="flex:1; padding:10px 12px;" onkeydown="if(event.key==='Enter') sendChat()">
                    <button onclick="sendChat()" style="background:var(--primary-color); color:white; border:none; padding:10px 14px; border-radius:var(--border-radius-md); cursor:pointer; flex-shrink:0;">
                        <i data-lucide="send" style="width:18px; height:18px;"></i>
                    </button>
                </div>
            </div>
            `;

            return html;
        }
    },

    closet: {
        title: "クローゼット",
        showFab: true,
        headerAction: `
            <div style="display:flex; gap:12px;">
                <button onclick="openFilterModal()" style="background:none; border:none; color:var(--text-primary); cursor:pointer;"><i data-lucide="filter"></i></button>
                <button id="btn-edit-closet" style="background:none; border:none; color:var(--primary-color); font-weight:600; font-size:1rem; cursor:pointer;">選択</button>
            </div>
        `,
        render: () => {
            if (!isDataLoaded) {
                return `<p class="text-center" style="margin-top:40px;"><i data-lucide="loader" class="spinner inline-icon"></i> 読み込み中...</p>`;
            }

            const filtered = getFilteredItems();
            let html = '';

            // スタイル円グラフ（服が1点以上あるとき表示）
            if (closetItems.length > 0) {
                const styleCounts = {};
                closetItems.forEach(item => {
                    (item.styles || []).forEach(s => { styleCounts[s] = (styleCounts[s] || 0) + 1; });
                });
                if (Object.keys(styleCounts).length > 0) {
                    html += `
                    <div class="card" style="margin-bottom:16px;">
                        <h3 class="section-title">📊 ファッション傾向分析</h3>
                        <div class="chart-container">
                            <canvas id="style-chart"></canvas>
                        </div>
                        <p style="font-size:0.75rem; color:var(--text-secondary); text-align:center; margin-top:8px;">登録中の服 ${closetItems.length}点から分析</p>
                    </div>`;
                }
            }

            const filterCount = Object.values(activeFilters).reduce((acc, arr) => acc + arr.length, 0);
            if (filterCount > 0) {
                html += `<p style="font-size:0.8rem; color:var(--primary-color); margin-bottom:12px; font-weight:bold;">${filterCount}つのフィルター適用中</p>`;
            }

            if (filtered.length === 0) {
                html += `<p class="text-center" style="color: var(--text-secondary); margin-top: 40px;"><i data-lucide="package-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px; display:block; margin:0 auto 16px;"></i><br>衣類が見つかりません。<br>右下の＋ボタンから追加してください。</p>`;
            } else {
                html += `<div class="closet-grid">
                    ${filtered.map(item => {
                        const tags = formatTags(item);
                        return `
                        <div class="closet-item" data-id="${item.id}" onclick="handleClosetItemClick('${item.id}')">
                            <img src="${item.image}" alt="clothing">
                            <div class="item-tags">
                                ${tags.slice(0,3).map(t => `<span class="tag-small">${t}</span>`).join('')}
                                ${tags.length > 3 ? `<span class="tag-small">...</span>` : ''}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>`;
            }

            html += `
                <div id="floating-delete-bar" class="floating-action-bar hidden">
                    <span id="selected-count">0件選択中</span>
                    <button onclick="deleteSelected()" style="background:white; color:#ef4444; border:none; padding:8px 16px; border-radius:16px; font-weight:bold; cursor:pointer;">削除</button>
                </div>
            `;
            return html;
        }
    },

    history: {
        title: "着用履歴",
        showFab: false,
        render: () => {
            if (!isDataLoaded) {
                return `<p class="text-center" style="margin-top:40px;"><i data-lucide="loader" class="spinner inline-icon"></i> 読み込み中...</p>`;
            }
            let html = `<div class="card"><h3 class="section-title">これまでの履歴</h3>`;
            if (wearHistory.length === 0) {
                html += `<p style="color: var(--text-secondary); font-size: 0.9rem;">まだ履歴がありません。<br>ホーム画面のコーデから「今日着た！」を押すと記録されます。</p>`;
            } else {
                html += `<div style="display:flex; flex-direction:column; gap:16px;">`;
                wearHistory.forEach(h => {
                    html += `
                    <div style="display:flex; gap:12px; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:12px;">
                        <img src="${h.image}" style="width:80px; height:80px; border-radius:8px; object-fit:cover;" alt="outfit">
                        <div>
                            <p style="font-size:0.75rem; color:var(--primary-color); font-weight:bold;">${h.dateStr}</p>
                            <p style="font-size:0.9rem; font-weight:bold; margin-top:4px;">${h.title}</p>
                        </div>
                    </div>`;
                });
                html += `</div>`;
            }
            html += `</div>`;
            return html;
        }
    },

    settings: {
        title: "設定",
        showFab: false,
        render: () => {
            return `
            <div class="card">
                <h3 class="section-title">テーマカラー</h3>
                <div class="theme-selector">
                    <button class="theme-btn" onclick="setTheme('morning')">爽やか</button>
                    <button class="theme-btn" onclick="setTheme('sunset')">夕焼け</button>
                    <button class="theme-btn" onclick="setTheme('night')">ダーク</button>
                </div>
            </div>

            <div class="card mt-4">
                <h3 class="section-title">📍 位置情報・天気</h3>
                <div class="info-box">
                    現在地の天気を取得します。位置情報は<strong>このデバイス内にのみ保存</strong>され、サーバーやクラウドには一切送信されません。
                </div>
                ${userLocation ? `
                    <div class="location-badge">
                        <i data-lucide="map-pin" class="inline-icon"></i>
                        <span>${userLocation.name}の天気を取得中</span>
                    </div>
                    <button onclick="disableLocationWeather()" class="btn-outline text-danger" style="font-size:0.85rem; padding:10px;">
                        位置情報をリセット（東京に戻す）
                    </button>
                ` : `
                    <button id="btn-location" onclick="enableLocationWeather()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                        <i data-lucide="map-pin" class="inline-icon"></i>
                        現在地から天気を取得する
                    </button>
                    <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:8px;">ボタンを押すとブラウザから位置情報の許可を求めます。</p>
                `}
            </div>

            <div class="card mt-4">
                <h3 class="section-title">🤖 AI機能</h3>
                <div class="info-box" style="color:#10b981; background:rgba(16,185,129,0.08); border-color:#10b981;">
                    ✅ AI機能は有効です。コーデ提案・画像認識・チャットがすぐに使えます。
                </div>
            </div>

            <div class="card mt-4">
                <h3 class="section-title">📅 Googleカレンダー連携</h3>
                ${isCalendarConnected ? `
                    <div style="display:flex; align-items:center; gap:8px; padding:12px; background:var(--primary-light); border-radius:8px; color:var(--primary-color);">
                        <i data-lucide="check-circle" class="inline-icon"></i> Googleカレンダー連携済み
                    </div>
                ` : `
                    <button class="btn-google" onclick="connectGoogleCalendar()">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="G" style="width:18px;">
                        Googleカレンダーと連携
                    </button>
                    <div class="info-box" style="margin-top:8px; margin-bottom:0;">
                        ⚠️ 「このアプリはGoogleに確認されていません」と表示された場合は、「詳細」→「sake0hito.github.ioに移動」をクリックして続行できます。
                    </div>
                `}
            </div>

            <div style="text-align:center; margin-top:32px; padding-bottom:16px;">
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:8px;">ログイン中: ${currentUser ? (currentUser.email || 'Googleアカウント') : ''}</p>
                <button onclick="logout()" style="background:transparent; color:#ef4444; border:1px solid #ef4444; padding:8px 16px; border-radius:20px; font-weight:bold; cursor:pointer;">ログアウト</button>
            </div>`;
        }
    }
};

// =============================================
// ナビゲーション
// =============================================
navButtons.forEach(btn => { btn.addEventListener('click', () => { navigate(btn.getAttribute('data-target')); }); });

function navigate(route) {
    if (currentRoute === 'closet' && isEditMode) toggleEditMode();

    navButtons.forEach(btn => btn.classList.remove('active'));
    const targetBtn = document.querySelector(`[data-target="${route}"]`);
    if (targetBtn) targetBtn.classList.add('active');

    currentRoute = route;
    const view = routes[route];
    if (!view) return;

    headerTitle.textContent = view.title;
    headerActions.innerHTML = view.headerAction || '';

    if (route === 'closet') {
        const btn = document.getElementById('btn-edit-closet');
        if (btn) btn.addEventListener('click', toggleEditMode);
    }

    mainContent.style.opacity = '0';
    setTimeout(() => {
        mainContent.innerHTML = view.render();
        lucide.createIcons();
        if (view.showFab) fabAdd.classList.remove('hidden');
        else fabAdd.classList.add('hidden');
        mainContent.style.opacity = '1';

        if (route === 'settings') updateThemeButtons();
        if (route === 'closet') setTimeout(() => initStyleChart(), 100);
        if (route === 'home') {
            setTimeout(() => {
                const chatEl = document.getElementById('chat-messages');
                if (chatEl) renderChatMessages(chatEl);
            }, 100);
        }
    }, 150);
}

// =============================================
// 着用履歴
// =============================================
window.saveToHistory = async function(index) {
    if (!currentUser) return;
    const outfit = weeklyOutfits[index];
    closeModal();
    const now = new Date();
    const dateStr = now.toLocaleDateString('ja-JP', {month: 'long', day: 'numeric'}) + " 着用";
    try {
        const docRef = await addDoc(collection(db, "history"), {
            userId: currentUser.uid,
            title: outfit.title,
            image: outfit.image,
            dateStr: dateStr,
            createdAt: now.getTime()
        });
        wearHistory.unshift({ id: docRef.id, userId: currentUser.uid, title: outfit.title, image: outfit.image, dateStr, createdAt: now.getTime() });
        alert("履歴に保存しました！");
    } catch (e) {
        alert("履歴の保存に失敗しました。");
        console.error(e);
    }
};

window.openOutfitDetails = function(index) {
    const outfit = weeklyOutfits[index];
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">${outfit.title}</h3>
            <img src="${outfit.image}" style="width:100%; height:240px; object-fit:cover; border-radius:12px; margin-bottom:16px;" alt="outfit">
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
                ${outfit.tags.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
            <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.6; margin-bottom:24px;">
                <i data-lucide="sparkles" class="inline-icon" style="color:var(--accent-color);"></i>
                ${outfit.reason}
            </p>
            <button onclick="saveToHistory(${index})" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">
                今日着た！履歴に残す
            </button>
            <button onclick="closeModal()" class="btn-outline text-center">閉じる</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

// =============================================
// クローゼット操作
// =============================================
window.handleClosetItemClick = function(id) {
    if (isEditMode) {
        const el = document.querySelector(`.closet-item[data-id="${id}"]`);
        if (selectedItems.has(id)) {
            selectedItems.delete(id); el.classList.remove('selected');
        } else {
            selectedItems.add(id); el.classList.add('selected');
        }
        document.getElementById('selected-count').textContent = `${selectedItems.size}件選択中`;
        document.querySelector('#floating-delete-bar button').disabled = selectedItems.size === 0;
    } else {
        openItemDetails(id);
    }
};

window.toggleEditMode = function() {
    isEditMode = !isEditMode;
    selectedItems.clear();
    const btn = document.getElementById('btn-edit-closet');
    if (btn) btn.textContent = isEditMode ? 'キャンセル' : '選択';
    document.querySelectorAll('.closet-item').forEach(el => {
        if (isEditMode) el.classList.add('selectable');
        else el.classList.remove('selectable', 'selected');
    });
    const bar = document.getElementById('floating-delete-bar');
    if (bar) {
        if (isEditMode) bar.classList.remove('hidden');
        else bar.classList.add('hidden');
    }
};

window.deleteSelected = async function() {
    if (selectedItems.size === 0) return;
    if (confirm(`選択した${selectedItems.size}件を削除しますか？`)) {
        try {
            for (let id of selectedItems) {
                const item = closetItems.find(i => i.id === id);
                await deleteDoc(doc(db, "closetItems", id));
                try {
                    const imgRef = ref(storage, item.image);
                    await deleteObject(imgRef);
                } catch(e) { /* 画像削除失敗は無視 */ }
            }
            closetItems = closetItems.filter(item => !selectedItems.has(item.id));
            toggleEditMode();
            navigate('closet');
        } catch(e) {
            alert("削除に失敗しました。");
            console.error(e);
        }
    }
};

window.openItemDetails = function(id) {
    const item = closetItems.find(i => i.id === id);
    if (!item) return;
    const tags = formatTags(item);
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">詳細情報</h3>
            <img src="${item.image}" style="width:100%; height:200px; object-fit:cover; border-radius:12px; margin-bottom:16px;" alt="clothing">
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
                ${tags.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
            ${item.memo ? `<p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:16px;">${item.memo}</p>` : ''}
            <button onclick="openEditForm('${item.id}')" style="width:100%; background:var(--surface-solid); color:var(--primary-color); border:2px solid var(--primary-color); padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">編集する</button>
            <button onclick="closeModal()" class="btn-outline text-center">閉じる</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

// =============================================
// フィルター
// =============================================
window.openFilterModal = function() {
    const renderMultiBtns = (group, options) => options.map(opt =>
        `<button class="filter-btn ${activeFilters[group].includes(opt) ? 'active' : ''}" onclick="toggleMultiFilter('${group}', '${opt}', this)">${opt}</button>`
    ).join('');

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">絞り込み</h3>
            <div class="form-group"><label>カテゴリ</label><div class="filter-btn-group">${renderMultiBtns('category', Object.keys(CATEGORIES))}</div></div>
            <div class="form-group"><label>カラー</label><div class="filter-btn-group">${renderMultiBtns('colors', COLORS)}</div></div>
            <div class="form-group"><label>スタイル</label><div class="filter-btn-group">${renderMultiBtns('styles', STYLES)}</div></div>
            <div class="form-group"><label>季節</label><div class="filter-btn-group">${renderMultiBtns('seasons', SEASONS)}</div></div>
            <button onclick="applyFilters()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">適用する</button>
            <button onclick="clearFilters()" class="btn-outline text-center text-danger">条件をクリア</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

window.toggleMultiFilter = function(group, val, btnEl) {
    const arr = activeFilters[group];
    if (arr.includes(val)) { arr.splice(arr.indexOf(val), 1); btnEl.classList.remove('active'); }
    else { arr.push(val); btnEl.classList.add('active'); }
};
window.applyFilters = function() { closeModal(); navigate('closet'); };
window.clearFilters = function() {
    activeFilters = {category:[], subCategory:[], colors:[], styles:[], seasons:[], lightness:[]};
    closeModal(); navigate('closet');
};

function getFilteredItems() {
    return closetItems.filter(item => {
        if (activeFilters.category.length > 0 && !activeFilters.category.includes(item.category)) return false;
        if (activeFilters.colors.length > 0 && !activeFilters.colors.some(c => (item.colors || []).includes(c))) return false;
        if (activeFilters.styles.length > 0 && !activeFilters.styles.some(s => (item.styles || []).includes(s))) return false;
        if (activeFilters.seasons.length > 0 && !activeFilters.seasons.some(s => (item.seasons || []).includes(s))) return false;
        return true;
    });
}

// =============================================
// 衣類追加フロー
// =============================================
fabAdd.addEventListener('click', () => {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">衣類または履物を登録</h3>
            <div id="upload-area" class="upload-area">
                <i data-lucide="camera" style="width: 32px; height: 32px; margin-bottom: 8px;"></i>
                <p>タップしてカメラ撮影<br><span style="font-size: 0.8rem; opacity: 0.8;">または画像を選択</span></p>
                <p style="font-size:0.75rem; margin-top:8px; opacity:0.7;">✨ AIが服を自動認識します</p>
            </div>
            <button onclick="closeModal()" class="btn-outline mt-4 text-center">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('upload-area').addEventListener('click', () => { closeModal(); nativeCameraInput.click(); });
});

let currentUploadedImage = null;
nativeCameraInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => { currentUploadedImage = ev.target.result; showAIAnalysisModal(); };
        reader.readAsDataURL(file);
    }
});

// AI画像解析（Geminiがあれば本物の解析、なければデフォルト値）
async function showAIAnalysisModal() {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content text-center">
            <img src="${currentUploadedImage}" style="width:120px; height:120px; object-fit:cover; border-radius:12px; margin:0 auto 16px; display:block;" alt="upload">
            <i data-lucide="loader" class="spinner" style="width: 32px; height: 32px; color: var(--primary-color); margin-bottom: 12px; display:block; margin:0 auto 12px;"></i>
            <p style="font-weight: 600;">AIが服を解析中...</p>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();

    // デフォルトデータ
    let analyzedData = {
        image: currentUploadedImage,
        category: "トップス・アウター",
        subCategory: "Tシャツ",
        colors: ["白"],
        lightness: "指定なし",
        styles: ["カジュアル系"],
        seasons: ["オールシーズン"],
        memo: ""
    };

    // Gemini AIで画像解析を実行
    try {
        const prompt = `この服の画像を分析して、以下のJSON形式のみで回答してください（余分な説明・コードブロック不要）：
{"category":"トップス・アウター または ボトムス または 帽子 または 靴 または ワンピース または ドレス または スーツ のいずれか","subCategory":"カテゴリに合った種類（例：Tシャツ、デニム、スニーカー）","colors":["赤 青 黄 緑 むらさき ピンク オレンジ ベージュ グレー 黒 白 から1〜2つ"],"styles":["カジュアル系 きれいめ（シンプル）系 エレガント系 クール系 フォーマル系 ストリート系 フェミニン・ガーリー系 アウトドア系 アメカジ系 から1〜2つ"],"seasons":["春 夏 秋 冬 オールシーズン から1つ以上"]}`;

        const result = await callGemini(prompt, currentUploadedImage);
        if (result) {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                analyzedData = {
                    image: currentUploadedImage,
                    category: CATEGORIES.hasOwnProperty(parsed.category) ? parsed.category : analyzedData.category,
                    subCategory: typeof parsed.subCategory === 'string' ? parsed.subCategory : analyzedData.subCategory,
                    colors: Array.isArray(parsed.colors) ? parsed.colors.filter(c => COLORS.includes(c)) : analyzedData.colors,
                    lightness: "指定なし",
                    styles: Array.isArray(parsed.styles) ? parsed.styles.filter(s => STYLES.includes(s)) : analyzedData.styles,
                    seasons: Array.isArray(parsed.seasons) ? parsed.seasons.filter(s => SEASONS.includes(s)) : analyzedData.seasons,
                    memo: ""
                };
                // 解析結果が空配列になった場合はデフォルトに戻す
                if (analyzedData.colors.length === 0) analyzedData.colors = ["白"];
                if (analyzedData.styles.length === 0) analyzedData.styles = ["カジュアル系"];
                if (analyzedData.seasons.length === 0) analyzedData.seasons = ["オールシーズン"];
            }
        }
    } catch (e) {
        console.warn("AI画像解析に失敗しました（デフォルト値で続行）:", e.message);
        // エラー時はデフォルト値のまま続行（アラートは出さない）
    }

    window.openEditForm(null, analyzedData);
}

// =============================================
// 編集フォーム
// =============================================
window.openEditForm = function(existingId = null, presetData = null) {
    const isNew = existingId === null;
    const baseItem = isNew ? presetData : closetItems.find(i => i.id === existingId);

    currentEditData = {
        _isNew: isNew,
        _existingId: existingId,
        image: baseItem.image,
        category: baseItem.category || "トップス・アウター",
        subCategory: baseItem.subCategory || "",
        colors: Array.isArray(baseItem.colors) ? [...baseItem.colors] : (baseItem.color ? [baseItem.color] : []),
        lightness: baseItem.lightness || "指定なし",
        styles: Array.isArray(baseItem.styles) ? [...baseItem.styles] : (baseItem.style ? [baseItem.style] : []),
        seasons: Array.isArray(baseItem.seasons) ? [...baseItem.seasons] : (baseItem.season ? [baseItem.season] : []),
        memo: baseItem.memo || ""
    };

    renderEditFormContent();
};

function renderEditFormContent() {
    const isNew = currentEditData._isNew;
    const existingId = currentEditData._existingId;

    const renderSingleBtn = (group, options) =>
        options.map(opt => `<button type="button" class="form-btn ${currentEditData[group] === opt ? 'active' : ''}" onclick="setFormSingle('${group}', '${opt}')">${opt}</button>`).join('');

    const renderMultiBtn = (group, options) =>
        options.map(opt => `<button type="button" class="form-btn ${currentEditData[group].includes(opt) ? 'active' : ''}" onclick="toggleFormMulti('${group}', '${opt}')">${opt}</button>`).join('');

    const subs = CATEGORIES[currentEditData.category];
    const subCatHtml = (subs && subs.length > 0)
        ? `<div class="form-group"><label>種類</label><div class="form-btn-group">${renderSingleBtn('subCategory', subs)}</div></div>`
        : '';

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">${isNew ? '✨ AI解析結果の確認・修正' : '情報の編集'}</h3>
            <img src="${currentEditData.image}" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:16px;" alt="clothing">

            <div class="form-group"><label>カテゴリ</label>
                <div class="form-btn-group">${renderSingleBtn('category', Object.keys(CATEGORIES))}</div>
            </div>
            ${subCatHtml}

            <div class="form-group"><label>カラー（複数選択可）</label>
                <div class="form-btn-group">${renderMultiBtn('colors', COLORS)}</div>
                <div class="form-btn-group mt-4">${renderSingleBtn('lightness', ["指定なし", "明るい", "暗い"])}</div>
            </div>

            <div class="form-group"><label>スタイル（複数選択可）</label>
                <div class="form-btn-group">${renderMultiBtn('styles', STYLES)}</div>
            </div>
            <div class="form-group"><label>季節（複数選択可）</label>
                <div class="form-btn-group">${renderMultiBtn('seasons', SEASONS)}</div>
            </div>

            <div class="form-group"><label>メモ</label>
                <input type="text" id="input-memo" class="input-field" placeholder="例：ユニクロ 2024年モデル" value="${currentEditData.memo}">
            </div>

            <button id="btn-save-item" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">
                ${isNew ? '☁️ クラウドに保存' : '変更を保存'}
            </button>
            <button onclick="closeModal()" class="btn-outline text-center">キャンセル</button>
        </div>
    `;
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('btn-save-item').addEventListener('click', () => saveItemData(isNew, existingId));
}

// フォームの単一選択
window.setFormSingle = function(group, val) {
    currentEditData[group] = val;
    if (group === 'category') {
        const subs = CATEGORIES[val];
        currentEditData.subCategory = (subs && subs.length > 0) ? subs[0] : "";
    }
    renderEditFormContent();
};

// フォームの複数選択
window.toggleFormMulti = function(group, val) {
    const arr = currentEditData[group];
    if (arr.includes(val)) arr.splice(arr.indexOf(val), 1);
    else arr.push(val);
    renderEditFormContent();
};

async function saveItemData(isNew, existingId) {
    if (!currentUser) return;
    const btnSave = document.getElementById('btn-save-item');
    if (!btnSave) return;
    btnSave.innerHTML = `<i data-lucide="loader" class="spinner inline-icon"></i> 保存中...`;
    btnSave.disabled = true;
    lucide.createIcons();

    currentEditData.memo = document.getElementById('input-memo')?.value || '';

    try {
        if (isNew) {
            const imgRef = ref(storage, 'images/' + currentUser.uid + '/' + Date.now() + '.jpg');
            await uploadString(imgRef, currentEditData.image, 'data_url');
            const downloadURL = await getDownloadURL(imgRef);
            currentEditData.image = downloadURL;

            const docData = {
                userId: currentUser.uid,
                createdAt: Date.now(),
                image: currentEditData.image,
                category: currentEditData.category,
                subCategory: currentEditData.subCategory,
                colors: currentEditData.colors,
                lightness: currentEditData.lightness,
                styles: currentEditData.styles,
                seasons: currentEditData.seasons,
                memo: currentEditData.memo
            };
            const docRef = await addDoc(collection(db, "closetItems"), docData);
            closetItems.unshift({ id: docRef.id, ...docData });
            nativeCameraInput.value = '';
        } else {
            const updateData = {
                category: currentEditData.category,
                subCategory: currentEditData.subCategory,
                colors: currentEditData.colors,
                lightness: currentEditData.lightness,
                styles: currentEditData.styles,
                seasons: currentEditData.seasons,
                memo: currentEditData.memo
            };
            await updateDoc(doc(db, "closetItems", existingId), updateData);
            const target = closetItems.find(i => i.id === existingId);
            if (target) Object.assign(target, updateData);
        }
        closeModal();
        navigate('closet');
    } catch(e) {
        alert("エラーが発生しました: " + e.message);
        console.error(e);
        btnSave.textContent = isNew ? '☁️ クラウドに保存' : '変更を保存';
        btnSave.disabled = false;
    }
}

// =============================================
// コーデ検証ルーム（AI解析）
// =============================================
window.openCoordPicker = function(slot) {
    currentTargetSlot = slot;
    const items = closetItems.filter(i =>
        slot === 'トップス・アウター' ? i.category === 'トップス・アウター' : ['ボトムス', '靴'].includes(i.category)
    );
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
            <h3 class="section-title">${slot}を選択</h3>
            ${items.length === 0
                ? '<p style="color:var(--text-secondary); text-align:center; padding:20px;">該当する服がありません。<br>クローゼットに追加してください。</p>'
                : `<div class="closet-grid">${items.map(item => `<div class="closet-item" onclick="selectForCoord('${item.id}')"><img src="${item.image}" alt="clothing"></div>`).join('')}</div>`
            }
            <button onclick="closeModal()" class="btn-outline text-center mt-4">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

window.selectForCoord = function(id) {
    const item = closetItems.find(i => i.id === id);
    if (currentTargetSlot === 'トップス・アウター') coordState.tops = item;
    else coordState.bottoms = item;
    closeModal();
    navigate('home');
};

window.clearCoord = function(slotKey) { coordState[slotKey] = null; navigate('home'); };

window.analyzeCoordination = async function() {
    const resEl = document.getElementById('coord-result');
    if (!resEl) return;

    if (!coordState.tops || !coordState.bottoms) {
        resEl.innerHTML = `<span style="color:#ef4444;"><i data-lucide="alert-circle" class="inline-icon"></i> トップスとボトムスの両方を選択してください！</span>`;
        resEl.classList.remove('hidden');
        lucide.createIcons();
        return;
    }

    resEl.innerHTML = `<i data-lucide="loader" class="spinner inline-icon"></i> AIが分析中...`;
    resEl.classList.remove('hidden');
    lucide.createIcons();

    const t = coordState.tops;
    const b = coordState.bottoms;

    try {
        const prompt = `以下の服の組み合わせを分析してください（日本語・150文字以内）：
トップス：${t.subCategory || t.category}、色：${(t.colors || []).join('・')}、スタイル：${(t.styles || []).join('・')}
ボトムス：${b.subCategory || b.category}、色：${(b.colors || []).join('・')}、スタイル：${(b.styles || []).join('・')}
★1〜5の相性評価と、具体的なワンポイントアドバイスを教えてください。`;
        const result = await callGemini(prompt);
        if (result) {
            resEl.innerHTML = `<strong>✨ AI分析結果</strong><br>${result.replace(/\n/g, '<br>')}`;
            return;
        }
    } catch (e) {
        console.error("コーデ分析エラー:", e);
        resEl.innerHTML = `<strong>⚠️ AI分析エラー</strong><br>しばらく時間をおいて再試行してください。`;
    }
};

// =============================================
// グローバル関数
// =============================================
window.closeModal = function() { modalContainer.classList.add('hidden'); };

window.setTheme = function(themeName) {
    document.body.className = `theme-${themeName}`;
    localStorage.setItem('ai-closet-theme', themeName);
    updateThemeButtons();
};

function updateThemeButtons() {
    const currentTheme = localStorage.getItem('ai-closet-theme') || 'morning';
    const btns = document.querySelectorAll('.theme-btn');
    btns.forEach((b, i) => {
        b.classList.remove('active');
        const themes = ['morning', 'sunset', 'night'];
        if (themes[i] === currentTheme) b.classList.add('active');
    });
}

window.connectGoogleCalendar = function() {
    if (!googleTokenClient) {
        alert("Google APIの準備中です。数秒後にお試しください。");
        return;
    }
    googleTokenClient.requestAccessToken();
};

// =============================================
// 初期化
// =============================================
function init() {
    const savedTheme = localStorage.getItem('ai-closet-theme') || 'morning';
    document.body.className = `theme-${savedTheme}`;
    mainContent.style.transition = 'opacity 0.15s ease';
    setTimeout(() => { initGoogleAuth(); }, 1000);
    fetchWeather();
    navigate('home');
    setTimeout(() => { lucide.createIcons(); }, 50);
}

init();
