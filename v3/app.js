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
const WORKER_URL = 'https://ai-closet-proxy.liyuandagui80.workers.dev';

const CATEGORIES = {
    "トップス": ["カットソー", "Tシャツ", "タンクトップ", "シャツ", "ブラウス", "スウェット", "パーカ", "ニット/セーター"],
    "アウター": ["ジャケット", "ブルゾン", "コート", "トレンチコート", "ダウンジャケット", "レザージャケット", "デニムジャケット", "マウンテンパーカ", "カーディガン", "ジレ・ベスト"],
    "ボトムス": ["デニム", "チノパン", "カーゴパンツ", "スラックス", "ショートパンツ", "クロップパンツ", "バミューダパンツ", "カプリパンツ", "スキニーパンツ", "サルエルパンツ", "テーパードパンツ", "ワイドパンツ", "ガウチョパンツ", "バギーパンツ", "その他のボトムス"],
    "帽子": ["ハット", "キャップ", "ニット帽", "その他の帽子"],
    "靴": ["スニーカー", "革靴", "ブーツ", "サンダル", "パンプス", "フラットシューズ"],
    "ワンピース": [],
    "ドレス": [],
    "スーツ": [],
    "小物": ["バッグ", "ベルト", "アクセサリー", "眼鏡", "サングラス", "時計", "マフラー", "手袋", "ストール", "スカーフ", "その他の小物"]
};
const COLORS = ["赤", "青", "黄", "緑", "むらさき", "ピンク", "オレンジ", "ベージュ", "グレー", "黒", "白"];
const STYLES = ["カジュアル系", "きれいめ（シンプル）系", "エレガント系", "クール系", "フォーマル系", "ストリート系", "フェミニン・ガーリー系", "アウトドア系", "アメカジ系"];
const SEASONS = ["春", "夏", "秋", "冬", "オールシーズン"];
const CHART_COLORS = ['#0ea5e9','#f59e0b','#10b981','#f43f5e','#8b5cf6','#06b6d4','#ec4899','#f97316','#84cc16'];

// 予定のキーワード → おすすめスタイル（カレンダー連動コーデ用）
const EVENT_STYLE_MAP = [
    { label: 'デート',     keywords: ['デート','ディナー','食事','ランチ','映画','カフェ','記念日'], styles: ['きれいめ（シンプル）系','フェミニン・ガーリー系','エレガント系'] },
    { label: '仕事',       keywords: ['会議','仕事','打ち合わせ','商談','面接','プレゼン','出勤','ミーティング','研修'], styles: ['きれいめ（シンプル）系','フォーマル系','クール系'] },
    { label: 'フォーマル', keywords: ['結婚式','披露宴','式典','パーティ','パーティー','セレモニー','卒業','入学','法事','お葬式'], styles: ['フォーマル系','エレガント系'] },
    { label: 'アウトドア', keywords: ['アウトドア','ハイキング','登山','キャンプ','運動','ジム','スポーツ','ランニング','釣り','バーベキュー','BBQ'], styles: ['アウトドア系','カジュアル系','アメカジ系'] },
    { label: 'お出かけ',   keywords: ['旅行','観光','お出かけ','ショッピング','買い物','遊び','散歩','お散歩'], styles: ['カジュアル系','ストリート系','アメカジ系'] },
];

function getEventStyle(eventText) {
    if (!eventText) return null;
    for (const e of EVENT_STYLE_MAP) {
        if (e.keywords.some(k => eventText.includes(k))) return e;
    }
    return null;
}

// テーマ一覧（id=CSSクラス名、color=設定画面の色見本＆ブラウザ色）
const THEMES = [
    { id: 'morning',  name: '爽やか',     color: '#0ea5e9' },
    { id: 'sunset',   name: '夕焼け',     color: '#f43f5e' },
    { id: 'night',    name: 'ダーク',     color: '#818cf8' },
    { id: 'forest',   name: '新緑',       color: '#10b981' },
    { id: 'lavender', name: 'ラベンダー', color: '#8b5cf6' },
    { id: 'sakura',   name: '桜',         color: '#ec4899' },
    { id: 'ocean',    name: '海',         color: '#06b6d4' },
    { id: 'mocha',    name: 'モカ',       color: '#b45309' },
];

// =============================================
// アプリ状態
// =============================================
let currentUser = null;
let googleTokenClient;
let isCalendarConnected = false;
let calendarEvents = {};
let calendarStatusMsg = '';

// 位置情報（localStorageにのみ保存・ユーザー別。Firebaseには送らない）
let userLocation = null;

// ログイン中ユーザーの保存設定（位置情報・カレンダー連携）を読み込む
function loadUserPrefs() {
    if (!currentUser) { userLocation = null; isCalendarConnected = false; return; }
    try { userLocation = JSON.parse(localStorage.getItem(`user_location_${currentUser.uid}`) || 'null'); }
    catch { userLocation = null; }
    isCalendarConnected = localStorage.getItem('google_calendar_connected') === 'true';
}

// 週間コーデの初期状態を生成（ユーザー切替時のリセットにも使用）
function buildInitialWeeklyOutfits() {
    return Array(7).fill(null).map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() + i);
        return {
            dateObj: d,
            dateStr: d.toLocaleDateString('ja-JP', {month:'short', day:'numeric', weekday:'short'}),
            isoDate: d.toISOString().split('T')[0],
            temp: "--°C", condition: "--", icon: "loader", event: null,
            title: i === 0 ? "今日のAIコーデ" : (i === 1 ? "明日のAIコーデ" : `${d.getDate()}日のAIコーデ`),
            image: null, topsImage: null, bottomsImage: null, outerImage: null, outerName: null,
            tags: [],
            reason: "クローゼットに服を登録すると、ここにAIコーデが提案されます。"
        };
    });
}
let weeklyOutfits = buildInitialWeeklyOutfits();

let closetItems = [];
let wearHistory = [];
let isDataLoaded = false;

let currentRoute = '';
let isEditMode = false;
let selectedItems = new Set();
let activeFilters = { category: [], subCategory: [], colors: [], styles: [], seasons: [], lightness: [] };
let coordState = { type: null, tops: null, bottoms: null, shoes: null, hat: null, accessory: null };
let currentTargetSlot = null;
let currentEditData = {};
let styleChartInstance = null;
let historyView = localStorage.getItem('history_view') || 'list'; // 'list' | 'calendar'
let historySortOrder = localStorage.getItem('history_sort') || 'newest'; // 'newest' | 'oldest'
let calendarMonth = new Date();

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
async function callGemini(prompt, imageBase64 = null, opts = {}) {
    let base64Data = null;
    let mimeType = 'image/jpeg';
    if (imageBase64) {
        const mimeMatch = imageBase64.match(/^data:(image\/[\w+]+);base64,/);
        if (mimeMatch) mimeType = mimeMatch[1];
        base64Data = imageBase64.replace(/^data:image\/[\w+]+;base64,/, '');
    }

    const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imageBase64: base64Data, mimeType, json: opts.json || false })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `APIエラー (${response.status})`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
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
            // ⚠️ localStorageにのみ保存（サーバー・Firebaseには一切送らない・ユーザー別）
            if (currentUser) localStorage.setItem(`user_location_${currentUser.uid}`, JSON.stringify(userLocation));
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
    if (currentUser) localStorage.removeItem(`user_location_${currentUser.uid}`);
    fetchWeather();
    navigate('settings');
};

// =============================================
// 認証
// =============================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        // ユーザーが変わった時は、前ユーザーのデータ・表示・設定を必ずリセット（情報の混在防止）
        const changed = !currentUser || currentUser.uid !== user.uid;
        currentUser = user;
        authOverlay.classList.add('hidden');
        if (changed) {
            isDataLoaded = false;
            closetItems = [];
            wearHistory = [];
            weeklyOutfits = buildInitialWeeklyOutfits();
            calendarEvents = {};
            loadUserPrefs();   // このユーザー専用の位置情報・カレンダー設定を読み込む
            fetchWeather();    // 読み込んだ位置で天気を取得し直す
        }
        fetchFirebaseData();
    } else {
        currentUser = null;
        isDataLoaded = false;
        closetItems = [];
        wearHistory = [];
        weeklyOutfits = buildInitialWeeklyOutfits();
        calendarEvents = {};
        userLocation = null;
        isCalendarConnected = false;
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

// Firebase Auth エラーを日本語で表示
function getAuthErrorMessage(e) {
    const code = e.code || '';
    const map = {
        'auth/operation-not-allowed':
            '⚠️ メール/パスワード認証が無効です。\nFirebase Console → Authentication → Sign-in method → Email/Password を有効にしてください。',
        'auth/email-already-in-use':
            'このメールアドレスはすでに登録されています。ログインをお試しください。',
        'auth/weak-password':
            'パスワードは6文字以上で入力してください。',
        'auth/user-not-found':
            'このメールアドレスは登録されていません。新規登録をお試しください。',
        'auth/wrong-password':
            'パスワードが正しくありません。',
        'auth/invalid-email':
            'メールアドレスの形式が正しくありません。',
        'auth/invalid-credential':
            'メールアドレスまたはパスワードが正しくありません。',
        'auth/too-many-requests':
            'ログイン試行が多すぎます。しばらく待ってからお試しください。',
        'auth/network-request-failed':
            'ネットワークエラーが発生しました。接続を確認してください。',
        'auth/configuration-not-found':
            '⚠️ Firebase の設定に問題があります。メール認証が有効か確認してください。',
    };
    return map[code] || `エラー (${code || e.message})`;
}

document.getElementById('btn-email-register').addEventListener('click', async () => {
    authError.textContent = "";
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-password').value;
    if (!email || !pass) { authError.textContent = "メールアドレスとパスワードを入力してください"; return; }
    if (pass.length < 6)  { authError.textContent = "パスワードは6文字以上で入力してください"; return; }
    const btn = document.getElementById('btn-email-register');
    btn.disabled = true; btn.textContent = '登録中...';
    try {
        await createUserWithEmailAndPassword(auth, email, pass);
    } catch(e) {
        authError.textContent = getAuthErrorMessage(e);
        btn.disabled = false; btn.textContent = '新規登録';
    }
});

document.getElementById('btn-email-login').addEventListener('click', async () => {
    authError.textContent = "";
    const email = document.getElementById('auth-email').value.trim();
    const pass  = document.getElementById('auth-password').value;
    if (!email || !pass) { authError.textContent = "メールアドレスとパスワードを入力してください"; return; }
    const btn = document.getElementById('btn-email-login');
    btn.disabled = true; btn.textContent = 'ログイン中...';
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) {
        authError.textContent = getAuthErrorMessage(e);
        btn.disabled = false; btn.textContent = 'ログイン';
    }
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
        loadSchedulesIntoEvents();   // 自分で入れた予定をコーデ提案に反映
        generateWeeklyOutfitsFromCloset();
        if (currentRoute === 'closet' || currentRoute === 'history' || currentRoute === 'home') navigate(currentRoute);
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
        if (ev) {
            const es = getEventStyle(ev);
            outfit.reason = es
                ? `📅 予定「${ev}」に合わせた${es.label}コーデ。気温(${outfit.temp})も考慮しています。`
                : `📅 予定「${ev}」と気温(${outfit.temp})に合わせて、${outfit.tags.join('・')}なコーデを提案します！`;
        } else {
            outfit.reason = `気温(${outfit.temp})に最適な${outfit.tags.join('・')}なコーデを選びました！`;
        }
    });
    if (currentRoute === 'home') navigate('home');
}

// カレンダーの予定を取得して反映（初回連携・更新の両方で使用）
async function fetchCalendarEvents(accessToken) {
    try {
        const timeMin = new Date().toISOString();
        const timeMaxDate = new Date(); timeMaxDate.setDate(timeMaxDate.getDate() + 7);
        const timeMax = timeMaxDate.toISOString();
        const res = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        if (!res.ok) {
            calendarStatusMsg = `⚠️ 予定の取得に失敗しました（エラー${res.status}）。Calendar APIが有効か確認してください。`;
            if (currentRoute === 'settings') navigate('settings');
            return 0;
        }
        const data = await res.json();
        calendarEvents = {};
        if (data.items) {
            data.items.forEach(item => {
                const d = item.start.dateTime || item.start.date;
                const iso = d.split('T')[0];
                if (!calendarEvents[iso]) calendarEvents[iso] = item.summary;
            });
        }
        const days = Object.keys(calendarEvents).length;
        calendarStatusMsg = days > 0
            ? `✅ ${days}日分の予定を読み込み、コーデに反映しました。`
            : `📭 今後7日間に予定はありませんでした。`;
        // 予定に合わせてコーデを選び直す
        if (isDataLoaded && (closetItems.length || wearHistory.length)) generateWeeklyOutfitsFromCloset();
        else updateWeeklyReasons();
        return days;
    } catch (e) {
        console.error(e);
        calendarStatusMsg = '⚠️ 予定の取得中にエラーが発生しました。';
        if (currentRoute === 'settings') navigate('settings');
        return 0;
    }
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
                    await fetchCalendarEvents(tokenResponse.access_token);
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
// 週間コーデ生成（所持服優先・前日被り防止・履歴反映）
// =============================================
// コーデ提案ルール（localStorageに保存。アウター必須判定に使用）
function getCoordRules() {
    try {
        return Object.assign({ outerCold: true, outerTemp: 15, outerRain: true },
            JSON.parse(localStorage.getItem('coord_rules') || '{}'));
    } catch {
        return { outerCold: true, outerTemp: 15, outerRain: true };
    }
}

window.setOuterRule = function(key, value) {
    const rules = getCoordRules();
    rules[key] = value;
    localStorage.setItem('coord_rules', JSON.stringify(rules));
    if (isDataLoaded && (closetItems.length || wearHistory.length)) generateWeeklyOutfitsFromCloset();
    navigate('settings');
};

// 寒い日・雨雪の日にアウターが必要か判定
function needsOuter(outfit, rules) {
    const cond = outfit.condition || '';
    if (rules.outerRain && (cond === '雨' || cond === '雪')) return true;
    const temp = parseInt(outfit.temp);
    if (rules.outerCold && outfit.temp !== '--°C' && !isNaN(temp) && temp <= rules.outerTemp) return true;
    return false;
}

function generateWeeklyOutfitsFromCloset() {
    if (closetItems.length === 0 && wearHistory.length === 0) return;

    // 「トップス・アウター」は旧データ。トップス扱いで後方互換を保つ
    const tops      = closetItems.filter(i => i.category === 'トップス' || i.category === 'トップス・アウター');
    const bottoms   = closetItems.filter(i => i.category === 'ボトムス');
    const onepieces = closetItems.filter(i => i.category === 'ワンピース' || i.category === 'ドレス');
    const outers    = closetItems.filter(i => i.category === 'アウター');
    const coordRules = getCoordRules();

    // 直近の着用履歴IDセット（被り回避）：新旧スキーマ対応
    const recentIds = new Set(wearHistory.slice(0, 14).flatMap(h =>
        h.items ? h.items.map(it => it.closetItemId) : [h.closetItemId]
    ).filter(Boolean));

    // 着用履歴プール（Day2以降に使用）
    const historyPool = wearHistory.filter(h => {
        const display = getHistoryDisplayData(h);
        return display.images.length > 0;
    }).slice(0, 14);
    const usedHistoryIds = new Set();

    let prevTopsId    = null;
    let prevBottomsId = null;
    let prevOpId      = null;

    weeklyOutfits.forEach((outfit, index) => {
        const weather = outfit.temp !== '--°C' ? `気温${outfit.temp}・${outfit.condition}` : '';
        outfit.outerImage = null; outfit.outerName = null; // 毎回リセット（前回の残りを消す）

        // Day2以降は着用履歴からのコーデも候補に（50%の確率）
        if (index > 0 && historyPool.length > 0) {
            const availHistory = historyPool.filter(h => !usedHistoryIds.has(h.id));
            if (availHistory.length > 0 && Math.random() < 0.5) {
                const h = availHistory[Math.floor(Math.random() * availHistory.length)];
                usedHistoryIds.add(h.id);
                const display = getHistoryDisplayData(h);

                // topsImage / bottomsImage を履歴から取得
                let topsImage = null, bottomsImage = null;
                if (h.items && h.items.length > 0) {
                    const topsItem = h.items.find(it =>
                        it.category === 'トップス' || it.category === 'トップス・アウター' || it.category === 'ワンピース' || it.category === 'ドレス');
                    const bottomsItem = h.items.find(it => it.category === 'ボトムス');
                    topsImage    = topsItem?.image || display.images[0];
                    bottomsImage = bottomsItem?.image || null;
                } else {
                    topsImage = display.images[0] || null;
                }

                outfit.image        = topsImage || display.images[0];
                outfit.topsImage    = topsImage;
                outfit.bottomsImage = bottomsImage;
                outfit.isFromHistory = true;
                outfit.tags = outfit.tags.length > 0 ? outfit.tags : ['過去の着用'];
                const label = h.occasion || h.dateStr || '過去の着用';
                outfit.reason = `${weather ? weather + 'に合う、' : ''}過去に記録したコーデ（${label}）の提案です。`;
                return;
            }
        }

        outfit.isFromHistory = false;

        // 予定があれば、その予定向きのスタイルを優先（カレンダー連動）
        const eventStyle = getEventStyle(calendarEvents[outfit.isoDate]);
        const prefer = (items) => {
            if (!eventStyle) return items;
            const m = items.filter(i => (i.styles || []).some(s => eventStyle.styles.includes(s)));
            return m.length > 0 ? m : items; // 該当する服が無ければ通常通り全候補から
        };

        // クローゼットベースのコーデ生成
        const opCandidates    = prefer(onepieces.filter(i => i.id !== prevOpId && !recentIds.has(i.id)));
        const topsCandidates  = prefer(tops.filter(i => i.id !== prevTopsId && !recentIds.has(i.id)));
        const bottomsCandidates = prefer(bottoms.filter(i => i.id !== prevBottomsId && !recentIds.has(i.id)));

        const useOnepiece = opCandidates.length > 0 && (topsCandidates.length === 0 || Math.random() < 0.25);

        if (useOnepiece) {
            const op = opCandidates[Math.floor(Math.random() * opCandidates.length)];
            outfit.image        = op.image;
            outfit.topsImage    = op.image;
            outfit.bottomsImage = null;
            outfit.tags  = [...new Set([
                ...(op.styles  || []).map(s => s.replace('系', '')),
                ...(op.seasons || [])
            ])].slice(0, 3);
            outfit.reason = `${weather ? weather + 'に合わせた' : ''}あなたの「${op.subCategory || 'ワンピース'}」コーデです。`;
            prevOpId = op.id;
        } else if (topsCandidates.length > 0) {
            const t = topsCandidates[Math.floor(Math.random() * topsCandidates.length)];
            const bPool = bottomsCandidates.length > 0 ? bottomsCandidates : bottoms;
            const b = bPool.length > 0 ? bPool[Math.floor(Math.random() * bPool.length)] : null;
            outfit.image        = t.image;
            outfit.topsImage    = t.image;
            outfit.bottomsImage = b?.image || null;
            const styleTags = [...new Set([
                ...(t.styles || []).map(s => s.replace('系', '')),
                ...(b ? (b.styles || []).map(s => s.replace('系', '')) : [])
            ])].slice(0, 2);
            outfit.tags = [...styleTags, ...(t.seasons || []).slice(0, 1)];
            outfit.reason = b
                ? `${weather ? weather + 'に合わせた' : ''}あなたの「${t.subCategory || t.category}」×「${b.subCategory || b.category}」コーデです。`
                : `${weather ? weather + 'に合わせた' : ''}あなたの「${t.subCategory || t.category}」を使ったコーデです。`;
            prevTopsId    = t.id;
            prevBottomsId = b ? b.id : prevBottomsId;
        }

        // 提案ルール：寒い日・雨雪の日はアウターをセット提案
        if (needsOuter(outfit, coordRules) && outers.length > 0) {
            const outerPool = prefer(outers);
            const o = outerPool[Math.floor(Math.random() * outerPool.length)];
            if (o) {
                outfit.outerImage = o.image;
                outfit.outerName  = o.subCategory || 'アウター';
                const why = (outfit.condition === '雨' || outfit.condition === '雪') ? '雨で冷えるので' : '冷えるので';
                outfit.reason += ` ${why}「${outfit.outerName}」も羽織って。`;
            }
        }
    });

    // 予定がある日は、コーデ理由に予定情報を添える
    weeklyOutfits.forEach(outfit => {
        const ev = calendarEvents[outfit.isoDate];
        if (ev && outfit.reason && outfit.reason.indexOf('予定') === -1) {
            const es = getEventStyle(ev);
            outfit.reason = `📅 予定「${ev}」${es ? `に合わせた${es.label}コーデ。 ` : 'の日。 '}` + outfit.reason;
        }
    });

    if (currentRoute === 'home') navigate('home');
}

// =============================================
// AI チャット
// =============================================
window.sendQuickPrompt = function(prompt) {
    const input = document.getElementById('chat-input');
    if (input) { input.value = prompt; }
    sendChat();
};

// 買い足しおすすめ（クローゼットの傾向分析 ＋ Geminiで不足アイテム提案 ＋ 楽天で実商品）
window.showRecommendItems = async function() {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content text-center">
            <i data-lucide="loader" class="spinner" style="width:32px; height:32px; color:var(--primary-color); display:block; margin:0 auto 12px;"></i>
            <p style="font-weight:600;">クローゼットを分析中...</p>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);

    // クローゼット分析（カテゴリ・スタイル・色の偏り）
    const catCounts = {}, styleCounts = {}, colorCounts = {};
    closetItems.forEach(it => {
        catCounts[it.category] = (catCounts[it.category] || 0) + 1;
        (it.styles || []).forEach(s => styleCounts[s] = (styleCounts[s] || 0) + 1);
        (it.colors || []).forEach(c => colorCounts[c] = (colorCounts[c] || 0) + 1);
    });
    const catStr = Object.entries(catCounts).map(([k, v]) => `${k}:${v}点`).join('、') || 'なし';
    const styleStr = Object.entries(styleCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('、') || 'なし';
    const colorStr = Object.entries(colorCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('、') || 'なし';

    // Geminiに「買い足すと着回しが広がるアイテム」を提案させる（JSON）
    const prompt = `あなたはプロのスタイリストです。次の人のクローゼットを分析し、「今は持っていないが、買い足すと手持ちの服との着回しが広がるアイテム」を3点提案してください。
【カテゴリ別の点数】${catStr}
【スタイルの傾向】${styleStr}
【色の傾向】${colorStr}

ルール:
- 手持ちに不足・手薄なカテゴリや色を補い、着回しが広がる物を選ぶ。
- 各提案に、手持ちとの組み合わせ理由を一言添える。
- keyword は楽天で検索する用の簡潔な日本語（例「白 シャツ メンズ」）。
- JSONのみで返す。
形式: {"recommends":[{"item":"アイテム名","reason":"理由(1文)","keyword":"楽天検索キーワード"}]}`;

    let recs = [];
    try {
        const r = JSON.parse(await callGemini(prompt, null, { json: true }));
        recs = (r.recommends || []).slice(0, 3);
    } catch (e) { recs = []; }

    // 各提案について楽天で実商品を取得（1件ずつ）
    for (const rec of recs) {
        rec.products = [];
        try {
            const res = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rakutenSearch: { keyword: rec.keyword || rec.item, hits: 2, sort: '-reviewCount' } })
            });
            const data = await res.json();
            rec.products = (data.Items || []).map(x => x.Item).filter(Boolean).slice(0, 2);
        } catch (e) { /* 商品取得失敗は理由だけ表示 */ }
    }

    // 表示
    let html = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
            <h3 class="section-title">🛍 買い足しおすすめ</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">あなたのクローゼットを分析し、着回しが広がるアイテムを提案します。</p>`;
    if (recs.length === 0) {
        html += `<p style="color:var(--text-secondary); font-size:0.88rem;">提案の取得に失敗しました。時間をおいて再度お試しください。</p>`;
    } else {
        recs.forEach(rec => {
            html += `<div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:12px; margin-bottom:12px;">
                <p style="font-weight:bold; margin-bottom:4px;">＋ ${rec.item || ''}</p>
                <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:8px;">${rec.reason || ''}</p>`;
            if (rec.products && rec.products.length) {
                html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">`;
                rec.products.forEach(p => {
                    const img = (p.mediumImageUrls && p.mediumImageUrls[0] && p.mediumImageUrls[0].imageUrl) ||
                                (p.smallImageUrls && p.smallImageUrls[0] && p.smallImageUrls[0].imageUrl) || '';
                    html += `<a href="${p.itemUrl}" target="_blank" rel="noopener" style="text-decoration:none; color:inherit; border:1px solid rgba(0,0,0,0.08); border-radius:8px; overflow:hidden; display:block;">
                        <img src="${img}" style="width:100%; height:100px; object-fit:cover;" alt="item">
                        <div style="padding:6px;">
                            <p style="font-size:0.68rem; line-height:1.3; height:2.6em; overflow:hidden;">${p.itemName}</p>
                            <p style="font-size:0.78rem; font-weight:bold; color:var(--primary-color); margin-top:2px;">¥${(p.itemPrice || 0).toLocaleString()}</p>
                        </div>
                    </a>`;
                });
                html += `</div>`;
            }
            html += `</div>`;
        });
        html += `<p style="font-size:0.7rem; color:var(--text-secondary);">※楽天市場の商品（アフィリエイトリンク）。タップで楽天が開きます。</p>`;
    }
    html += `<button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button></div>`;

    modalContainer.innerHTML = html;
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

// 今季のトレンドコーデ（楽天の人気商品＝トレンド傾向 ＋ Geminiで手持ち着こなし提案）
window.showTrendCoord = async function() {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content text-center">
            <i data-lucide="loader" class="spinner" style="width:32px; height:32px; color:var(--primary-color); display:block; margin:0 auto 12px;"></i>
            <p style="font-weight:600;">今季のトレンドを調べています...</p>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);

    const now = new Date();
    const year = now.getFullYear();
    const mo = now.getMonth() + 1;
    const season = (mo>=3&&mo<=5)?'春':(mo>=6&&mo<=8)?'夏':(mo>=9&&mo<=11)?'秋':'冬';

    // 1) 楽天で「今季の人気ファッション」を取得（＝トレンド傾向）
    let trendItems = [];
    try {
        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rakutenSearch: { keyword: `${season} ファッション トレンド`, hits: 8, sort: '-reviewCount' } })
        });
        const data = await res.json();
        trendItems = (data.Items || []).map(x => x.Item).filter(Boolean);
    } catch (e) { /* 取得失敗してもAIだけで続行 */ }

    // 2) Geminiに「人気傾向＋手持ち服」を渡して着こなし提案（JSON）
    const itemList = closetItems.slice(0, 40).map(it => {
        const c = (it.colors || []).join('・') || '色未登録';
        const s = (it.styles || []).map(x => x.replace('系', '')).join('・');
        return `・${it.subCategory || it.category}（${c}${s ? '／' + s : ''}）`;
    }).join('\n') || '（まだ服が登録されていません）';
    const trendNames = trendItems.slice(0, 8).map(it => it.itemName).join(' / ') || '（取得できませんでした）';

    const prompt = `あなたはプロのファッションスタイリストです。${year}年${season}に楽天で今人気の以下の商品（＝今のトレンド傾向）を踏まえ、ユーザーが実際に持っている服でトレンド感を出す着こなしを提案してください。

【今人気の商品（トレンド傾向）】
${trendNames}

【手持ちの服】
${itemList}

ルール:
- 必ず手持ちの服から具体的に名前を挙げる。持っていない服は使わない。
- 日本語で簡潔に。JSONのみで返す。
形式: {"trend":"今季トレンドの要点(1〜2文)","suggestions":[{"title":"コーデ名","items":["使う手持ちの服"],"point":"トレンドの取り入れ方(1文)"}]}`;

    let ai = null;
    try { ai = JSON.parse(await callGemini(prompt, null, { json: true })); } catch (e) { ai = null; }

    // 3) 表示
    let html = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">✨ 今季のトレンドコーデ（${year}年${season}）</h3>`;
    if (ai && ai.trend) {
        html += `<div style="background:var(--primary-light); padding:12px; border-radius:10px; margin-bottom:12px; font-size:0.88rem;"><strong>今季のトレンド：</strong>${ai.trend}</div>`;
        (ai.suggestions || []).forEach(s => {
            html += `<div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:12px; margin-bottom:10px;">
                <p style="font-weight:bold; margin-bottom:4px;">${s.title || 'コーデ'}</p>
                <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:4px;">使う服：${(s.items || []).join('・')}</p>
                <p style="font-size:0.82rem;">${s.point || ''}</p>
            </div>`;
        });
    } else {
        html += `<p style="color:var(--text-secondary); font-size:0.88rem;">AI提案の取得に失敗しました。時間をおいて再度お試しください。</p>`;
    }
    if (trendItems.length) {
        html += `<h4 style="margin:14px 0 8px; font-size:0.95rem;">🛍 今売れている参考アイテム（楽天）</h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">`;
        trendItems.slice(0, 4).forEach(it => {
            const img = (it.mediumImageUrls && it.mediumImageUrls[0] && it.mediumImageUrls[0].imageUrl) ||
                        (it.smallImageUrls && it.smallImageUrls[0] && it.smallImageUrls[0].imageUrl) || '';
            html += `<a href="${it.itemUrl}" target="_blank" rel="noopener" style="text-decoration:none; color:inherit; border:1px solid rgba(0,0,0,0.08); border-radius:10px; overflow:hidden; display:block;">
                <img src="${img}" style="width:100%; height:120px; object-fit:cover;" alt="item">
                <div style="padding:8px;">
                    <p style="font-size:0.72rem; line-height:1.3; height:2.6em; overflow:hidden;">${it.itemName}</p>
                    <p style="font-size:0.82rem; font-weight:bold; color:var(--primary-color); margin-top:4px;">¥${(it.itemPrice || 0).toLocaleString()}</p>
                </div>
            </a>`;
        });
        html += `</div><p style="font-size:0.7rem; color:var(--text-secondary); margin-top:8px;">※楽天市場の人気商品（アフィリエイトリンク）。タップで楽天が開きます。</p>`;
    }
    html += `<button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button></div>`;

    modalContainer.innerHTML = html;
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
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

    // 手持ちの服リスト（最大40点まで具体的に渡す）
    const styleCounts = {};
    closetItems.forEach(item => {
        (item.styles || []).forEach(s => { styleCounts[s] = (styleCounts[s] || 0) + 1; });
    });
    const styleStr = Object.entries(styleCounts).sort((a,b) => b[1]-a[1]).slice(0,3)
        .map(([k,v]) => `${k}(${v}点)`).join('、') || 'データなし';
    const itemList = closetItems.slice(0, 40).map(it => {
        const c = (it.colors || []).join('・') || '色未登録';
        const s = (it.styles || []).map(x => x.replace('系', '')).join('・');
        return `・${it.subCategory || it.category}（${c}${s ? '／' + s : ''}${it.size ? '／' + it.size : ''}）`;
    }).join('\n') || '（まだ服が登録されていません）';
    const todayWeather = weeklyOutfits[0];
    const locationName = userLocation?.name || '東京';

    // 直近の会話履歴（最新の質問を除く直近6件）
    const history = chatMessages.slice(-7, -1)
        .map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}：${m.text}`).join('\n');

    const systemPrompt = `あなたはプロのファッションスタイリストAIです。次のルールを必ず守って回答してください：\n・ユーザーが実際に持っている服（下記リスト）の中から具体的に名前を挙げて提案する。持っていない服は勧めない（買い足しの相談をされた場合は除く）。\n・登録された色をそのまま使い、実物の色を勝手に想像しない。\n・天気・気温も考慮する。\n・日本語・300文字以内・フレンドリーで実用的に。`;
    const contextStr = `【手持ちの服 ${closetItems.length}点（主なスタイル: ${styleStr}）】\n${itemList}\n\n【今日の天気(${locationName})】${todayWeather.temp}、${todayWeather.condition}`;
    const fullPrompt = `${systemPrompt}\n\n${contextStr}\n\n【これまでの会話】\n${history || '（なし）'}\n\n【ユーザーの質問】\n${msg}`;

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
                // トップス＋ボトムスを横並び表示
                const thumbHtml = (outfit.topsImage && outfit.bottomsImage)
                    ? `<div style="display:flex; gap:2px; height:200px; overflow:hidden;">
                           <img src="${outfit.topsImage}" alt="tops" style="flex:1; object-fit:cover; min-width:0;">
                           <img src="${outfit.bottomsImage}" alt="bottoms" style="flex:1; object-fit:cover; min-width:0;">
                       </div>`
                    : `<img src="${outfit.topsImage || outfit.image}" alt="Outfit" class="outfit-image" style="height:200px;" />`;

                html += `
                <div class="carousel-item">
                    <div class="card outfit-card" onclick="openOutfitDetails(${index})">
                        <div style="padding:12px; font-weight:bold; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; justify-content:space-between;">
                            <span>${outfit.dateStr}</span>
                            <span style="color:var(--text-secondary); font-size:0.9rem;"><i data-lucide="${outfit.icon}" class="inline-icon"></i> ${outfit.temp}</span>
                        </div>
                        ${calendarEvents[outfit.isoDate] ? `<div style="padding:6px 12px; background:var(--accent-color); color:#fff; font-size:0.78rem; font-weight:600; display:flex; align-items:center; gap:6px;"><i data-lucide="calendar-check" class="inline-icon"></i>予定: ${calendarEvents[outfit.isoDate]}</div>` : ''}
                        ${thumbHtml}
                        <div class="outfit-details">
                            <h4 class="mb-4">${outfit.isFromHistory ? '📅 ' : ''}${outfit.title}</h4>
                            <div style="display:flex; flex-wrap:wrap; gap:4px;">${outfit.tags.map(tag => `<span class="tag-small">${tag}</span>`).join('')}</div>
                            ${outfit.outerImage ? `<div style="margin-top:6px;"><span class="tag-small" style="background:var(--accent-color); color:#fff;">🧥 ${outfit.outerName || 'アウター'}</span></div>` : ''}
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

            // 今季のトレンドコーデ（楽天の人気商品＋AI）
            html += `
            <button onclick="showTrendCoord()" style="width:100%; background:var(--accent-color); color:#fff; border:none; padding:14px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-bottom:16px; display:flex; align-items:center; justify-content:center; gap:8px;">
                <i data-lucide="trending-up" class="inline-icon"></i> 今季のトレンドコーデを見る
            </button>
            `;

            // コーデ検証ルーム
            html += `
            <h3 class="section-title mt-4">コーデ検証ルーム</h3>
            <div class="card" id="coord-room">
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">手持ちの服を組み合わせてAIの評価を聞いてみよう！</p>
                ${renderCoordRoom()}
            </div>
            `;

            // AIチャット
            html += `
            <h3 class="section-title mt-4">💬 AIスタイリストに相談</h3>
            <div class="card" style="padding:16px;">
                <div class="quick-prompts">
                    <button class="quick-prompt-btn" onclick="sendQuickPrompt('今日の天気に合うコーデを提案して')">今日の天気×コーデ</button>
                    <button class="quick-prompt-btn" onclick="sendQuickPrompt('予定に関係なく、気分が上がるおすすめコーデを提案して')">気分でコーデ</button>
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
                html += `
                <button onclick="showRecommendItems()" style="width:100%; background:var(--primary-color); color:#fff; border:none; padding:13px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-bottom:16px; display:flex; align-items:center; justify-content:center; gap:8px;">
                    <i data-lucide="shopping-bag" class="inline-icon"></i> 買い足しおすすめを見る
                </button>`;
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
        headerAction: `
            <div style="display:flex; gap:8px; align-items:center;">
                <button id="btn-history-view-list" onclick="setHistoryView('list')" style="background:none; border:none; cursor:pointer; padding:4px; color:var(--primary-color);" title="リスト表示"><i data-lucide="list"></i></button>
                <button id="btn-history-view-cal" onclick="setHistoryView('calendar')" style="background:none; border:none; cursor:pointer; padding:4px; color:var(--primary-color);" title="カレンダー表示"><i data-lucide="calendar-days"></i></button>
            </div>
        `,
        render: () => {
            if (!isDataLoaded) {
                return `<p class="text-center" style="margin-top:40px;"><i data-lucide="loader" class="spinner inline-icon"></i> 読み込み中...</p>`;
            }
            let html = `
            <button onclick="openAddHistoryModal()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-bottom:16px; display:flex; align-items:center; justify-content:center; gap:8px;">
                <i data-lucide="plus-circle" class="inline-icon"></i> 着用を手動で記録する
            </button>`;
            if (historyView === 'calendar') {
                html += renderHistoryCalendar();
            } else {
                html += renderHistoryList();
            }
            return html;
        }
    },

    settings: {
        title: "設定",
        showFab: false,
        render: () => {
            const rules = getCoordRules();
            return `
            <div class="card">
                <h3 class="section-title">テーマカラー</h3>
                <div class="theme-selector">
                    ${THEMES.map(t => `
                    <button class="theme-btn" data-theme="${t.id}" onclick="setTheme('${t.id}')">
                        <span class="theme-dot" style="background:${t.color}"></span>${t.name}
                    </button>`).join('')}
                </div>
            </div>

            <div class="card mt-4">
                <h3 class="section-title">🧥 コーデ提案ルール</h3>
                <div class="info-box">寒い日や雨の日に、トップスと一緒にアウターも自動で提案します。</div>
                <div class="setting-row">
                    <span>寒い日はアウターも提案</span>
                    <label class="toggle-switch"><input type="checkbox" ${rules.outerCold ? 'checked' : ''} onchange="setOuterRule('outerCold', this.checked)"><span class="slider"></span></label>
                </div>
                <div class="setting-row">
                    <span>　└ 何℃以下で提案？</span>
                    <select onchange="setOuterRule('outerTemp', parseInt(this.value))" class="input-field" style="width:auto; padding:8px 10px;">
                        <option value="18" ${rules.outerTemp === 18 ? 'selected' : ''}>18℃以下</option>
                        <option value="15" ${rules.outerTemp === 15 ? 'selected' : ''}>15℃以下</option>
                        <option value="12" ${rules.outerTemp === 12 ? 'selected' : ''}>12℃以下</option>
                    </select>
                </div>
                <div class="setting-row">
                    <span>雨・雪の日はアウターも提案</span>
                    <label class="toggle-switch"><input type="checkbox" ${rules.outerRain ? 'checked' : ''} onchange="setOuterRule('outerRain', this.checked)"><span class="slider"></span></label>
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
                <h3 class="section-title">🤖 AI接続テスト</h3>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">AIチャットや服の解析が動かない場合、ここで原因を確認できます。</p>
                <button type="button" onclick="testAIConnection()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;" id="btn-ai-test">
                    <i data-lucide="wifi" class="inline-icon"></i> AIをテストする
                </button>
                <div id="ai-test-result" style="display:none; margin-top:12px; background:var(--surface-solid); border-radius:8px; padding:12px; font-size:0.85rem; line-height:1.6;"></div>
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
    const isoDate = now.toISOString().split('T')[0];

    // 新スキーマ: items配列で保存
    const items = [];
    if (outfit.topsImage) {
        items.push({ image: outfit.topsImage, category: 'トップス・アウター', subCategory: '', title: outfit.title });
    }
    if (outfit.bottomsImage) {
        items.push({ image: outfit.bottomsImage, category: 'ボトムス', subCategory: '', title: 'ボトムス' });
    }
    if (items.length === 0 && outfit.image) {
        items.push({ image: outfit.image, category: 'コーデ', subCategory: '', title: outfit.title });
    }

    try {
        const docData = {
            userId: currentUser.uid,
            dateStr, isoDate,
            occasion: '',
            items,
            memo: '',
            createdAt: now.getTime()
        };
        const docRef = await addDoc(collection(db, "history"), docData);
        wearHistory.unshift({ id: docRef.id, ...docData });
        alert("履歴に保存しました！");
    } catch (e) {
        alert("履歴の保存に失敗しました。");
        console.error(e);
    }
};

// =============================================
// 帽子レコメンド: 季節・気温・天候の複合判定（内部ロジック）
// =============================================
function getHatRecommendation(outfit) {
    const dateObj = outfit.dateObj || new Date();
    const month = dateObj.getMonth() + 1; // 1〜12
    const temp = parseInt(outfit.temp);
    const condition = outfit.condition || '';

    // 天気・気温データ未取得時
    if (!temp || isNaN(temp) || outfit.temp === '--°C') return { recommend: false };

    // 雨の日は帽子より傘（雪の日はニット帽が有効なので続行）
    if (condition === '雨') return { recommend: false };

    // 氷点下（0°C未満）→ 季節・天候問わずニット帽必須
    if (temp < 0) {
        return { recommend: true, type: 'ニット帽', subTypes: ['ニット帽'],
            reason: `氷点下${temp}°Cの極寒です。ニット帽で頭と耳をしっかり防寒しましょう。` };
    }

    // 季節判定
    const isSpring = month >= 3 && month <= 5;
    const isSummer = month >= 6 && month <= 8;
    const isAutumn = month >= 9 && month <= 11;
    const isWinter = month === 12 || month <= 2;
    const isSunny  = condition === '快晴' || condition === '晴れ';
    const isCloudy = condition === '曇り' || condition === '霧';

    // ── 夏 ──────────────────────────────
    // 晴れ・高温（≥25°C）→ キャップ（紫外線・暑さ対策）
    if (isSunny && temp >= 25) {
        return { recommend: true, type: 'キャップ', subTypes: ['キャップ'],
            reason: `${temp}°Cの強い日差しと暑さ対策にキャップがおすすめです。UV対策にもなります。` };
    }
    // 曇り・高温（≥28°C）→ 蒸し暑いが日差しなし、帽子不要
    if (isCloudy && temp >= 28) {
        return { recommend: false };
    }
    // 晴れ・やや暑い（20〜24°C）→ キャップ or ハット
    if (isSunny && temp >= 20 && temp < 25) {
        return { recommend: true, type: 'キャップ・ハット', subTypes: ['キャップ', 'ハット'],
            reason: `${temp}°Cの日差し対策に、キャップやハットがぴったりです。` };
    }

    // ── 春・秋（晴れ）────────────────────
    // 春 晴れ・暖か（15〜19°C）→ ハット（おしゃれ）
    if (isSunny && isSpring && temp >= 15) {
        return { recommend: true, type: 'ハット', subTypes: ['ハット', 'キャップ'],
            reason: `春の穏やかな日差しに、ハットがコーデのアクセントになります。` };
    }
    // 秋 晴れ・涼しい（12〜22°C）→ ハット（秋らしいスタイル）
    if (isSunny && isAutumn && temp >= 12 && temp <= 22) {
        return { recommend: true, type: 'ハット', subTypes: ['ハット', 'キャップ'],
            reason: `秋晴れの日に、ハットがコーデに深みを加えてくれます。` };
    }

    // ── 秋冬（寒い）─────────────────────
    // 秋冬 低温（≤8°C）→ ニット帽（防寒必須）
    if ((isAutumn || isWinter) && temp <= 8) {
        return { recommend: true, type: 'ニット帽', subTypes: ['ニット帽'],
            reason: `${temp}°Cの寒さと冷たい風対策に、ニット帽がおすすめです。` };
    }
    // 冬 やや寒い（9〜14°C）→ ニット帽またはキャップ
    if (isWinter && temp <= 14) {
        return { recommend: true, type: 'ニット帽', subTypes: ['ニット帽', 'キャップ'],
            reason: `冬の防寒対策に、ニット帽を合わせると暖かく過ごせます。` };
    }
    // 秋 少し肌寒い（9〜11°C）→ ニット帽
    if (isAutumn && temp <= 11) {
        return { recommend: true, type: 'ニット帽', subTypes: ['ニット帽'],
            reason: `肌寒い秋の日には、ニット帽で耳まで温めるのがおすすめです。` };
    }

    // それ以外は帽子不要
    return { recommend: false };
}

window.openOutfitDetails = function(index) {
    const outfit = weeklyOutfits[index];

    // トップス＋ボトムスの横並び表示
    let imageHtml;
    if (outfit.topsImage && outfit.bottomsImage) {
        imageHtml = `<div style="display:flex; gap:3px; height:240px; border-radius:12px; overflow:hidden; margin-bottom:16px;">
            <img src="${outfit.topsImage}" alt="tops" style="flex:1; object-fit:cover; min-width:0;">
            <img src="${outfit.bottomsImage}" alt="bottoms" style="flex:1; object-fit:cover; min-width:0;">
        </div>`;
    } else {
        imageHtml = `<img src="${outfit.topsImage || outfit.image}" style="width:100%; height:240px; object-fit:cover; border-radius:12px; margin-bottom:16px;" alt="outfit">`;
    }

    // 季節・気温・天候に基づくスマート帽子レコメンド
    const hatRec = getHatRecommendation(outfit);
    let hatHtml = '';
    if (hatRec.recommend) {
        const allHats = closetItems.filter(i => i.category === '帽子');
        // 推奨タイプに一致する帽子を優先
        const matched = hatRec.subTypes
            ? allHats.filter(h => hatRec.subTypes.some(t => (h.subCategory || '').includes(t)))
            : allHats;
        const displayHats = matched.length > 0 ? matched : allHats;

        const hatItemHtml = displayHats.length > 0
            ? `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:8px;">
                ${displayHats.slice(0, 3).map(hat => `
                    <div style="display:flex; align-items:center; gap:6px;">
                        <img src="${hat.image}" style="width:44px; height:44px; border-radius:6px; object-fit:cover;">
                        <span style="font-size:0.78rem; color:var(--text-secondary);">${hat.subCategory || '帽子'}</span>
                    </div>`).join('')}
               </div>`
            : `<p style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">クローゼットに「${hatRec.type}」を登録すると具体的に提案できます。</p>`;
        hatHtml = `
            <div style="background:var(--primary-light); border:1px solid rgba(245,158,11,0.25); padding:12px; border-radius:10px; margin-bottom:16px;">
                <p style="font-weight:bold; color:#b45309; margin-bottom:4px; font-size:0.9rem;">
                    🎩 ${hatRec.type}がおすすめ
                </p>
                <p style="font-size:0.82rem; color:var(--text-secondary);">${hatRec.reason}</p>
                ${hatItemHtml}
            </div>`;
    }

    // 登録済みの小物から、コーデのスタイルに合うものを提案
    let accessoryHtml = '';
    const allAccessories = closetItems.filter(i => i.category === '小物');
    if (allAccessories.length > 0) {
        const tagSet = new Set(outfit.tags);
        const matched = allAccessories.filter(a => (a.styles || []).some(s => tagSet.has(s.replace('系', ''))));
        const displayAcc = matched.length > 0 ? matched : allAccessories;
        accessoryHtml = `
            <div style="background:var(--primary-light); border:1px solid rgba(14,165,233,0.2); padding:12px; border-radius:10px; margin-bottom:16px;">
                <p style="font-weight:bold; color:var(--text-primary); margin-bottom:8px; font-size:0.9rem;">👜 合わせたい小物</p>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    ${displayAcc.slice(0, 4).map(a => `
                        <div style="display:flex; flex-direction:column; align-items:center; gap:4px; width:60px;">
                            <img src="${a.image}" style="width:56px; height:56px; border-radius:8px; object-fit:cover;">
                            <span style="font-size:0.7rem; color:var(--text-secondary); text-align:center;">${a.subCategory || '小物'}</span>
                        </div>`).join('')}
                </div>
            </div>`;
    }

    // アウター提案（寒い日・雨雪の日のみ）
    let outerHtml = '';
    if (outfit.outerImage) {
        outerHtml = `
            <div style="background:var(--primary-light); border:1px solid rgba(14,165,233,0.2); padding:12px; border-radius:10px; margin-bottom:16px; display:flex; align-items:center; gap:12px;">
                <img src="${outfit.outerImage}" style="width:56px; height:56px; border-radius:8px; object-fit:cover; flex-shrink:0;">
                <div>
                    <p style="font-weight:bold; color:var(--text-primary); font-size:0.9rem;">🧥 アウターもセットで</p>
                    <p style="font-size:0.8rem; color:var(--text-secondary);">${outfit.outerName || 'アウター'}を羽織るのがおすすめです。</p>
                </div>
            </div>`;
    }

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">${outfit.title}</h3>
            ${imageHtml}
            ${outerHtml}
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
                ${outfit.tags.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
            <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.6; margin-bottom:16px;">
                <i data-lucide="sparkles" class="inline-icon" style="color:var(--accent-color);"></i>
                ${outfit.reason}
            </p>
            ${hatHtml}
            ${accessoryHtml}
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
            ${item.size ? `<p style="font-size:0.9rem; margin-bottom:12px;"><span style="color:var(--text-secondary);">📏 サイズ：</span><strong>${item.size}</strong></p>` : ''}
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
        category: "トップス",
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
{"category":"トップス または アウター または ボトムス または 帽子 または 靴 または ワンピース または ドレス または スーツ または 小物 のいずれか（ジャケット・コート・ブルゾン・ダウン・カーディガンなど羽織るものは「アウター」、バッグ・ベルト・アクセサリー・眼鏡・サングラス・時計・マフラー・手袋などは「小物」）","subCategory":"カテゴリに合った種類（例：Tシャツ、コート、デニム、スニーカー、バッグ、眼鏡）","colors":["赤 青 黄 緑 むらさき ピンク オレンジ ベージュ グレー 黒 白 から1〜2つ"],"styles":["カジュアル系 きれいめ（シンプル）系 エレガント系 クール系 フォーマル系 ストリート系 フェミニン・ガーリー系 アウトドア系 アメカジ系 から1〜2つ"],"seasons":["春 夏 秋 冬 オールシーズン から1つ以上"]}`;

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
        memo: baseItem.memo || "",
        size: baseItem.size || ""
    };

    renderEditFormContent();
};

function renderEditFormContent() {
    const isNew = currentEditData._isNew;
    const existingId = currentEditData._existingId;

    const renderSingleBtn = (group, options) =>
        options.map(opt => `<button type="button" class="form-btn ${currentEditData[group] === opt ? 'active' : ''}" data-group="${group}" data-val="${opt}" onclick="setFormSingle('${group}', '${opt}')">${opt}</button>`).join('');

    const renderMultiBtn = (group, options) =>
        options.map(opt => `<button type="button" class="form-btn ${(currentEditData[group]||[]).includes(opt) ? 'active' : ''}" data-group="${group}" data-val="${opt}" onclick="toggleFormMulti('${group}', '${opt}')">${opt}</button>`).join('');

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

            ${currentEditData.category !== '小物' ? `<div class="form-group"><label>サイズ（任意・自由入力）</label>
                <input type="text" id="input-size" class="input-field" placeholder="例：M ／ 160cm ／ ウエスト72" value="${(currentEditData.size || '').replace(/"/g, '&quot;')}">
                <p onclick="toggleSizeChart()" style="font-size:0.8rem; color:var(--primary-color); font-weight:600; cursor:pointer; margin-top:8px; display:inline-block;">
                    📏 サイズチャートを確認する
                </p>
                <div id="size-chart" class="hidden" style="margin-top:8px; background:var(--surface-solid); border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:12px; font-size:0.8rem; color:var(--text-secondary);">
                    <strong style="color:var(--text-primary);">サイズの目安（参考）</strong>
                    <table style="width:100%; border-collapse:collapse; margin-top:8px;">
                        <tr style="border-bottom:1px solid rgba(0,0,0,0.1);">
                            <th style="text-align:left; padding:4px;">表記</th><th style="text-align:left; padding:4px;">レディース</th><th style="text-align:left; padding:4px;">メンズ(身長)</th>
                        </tr>
                        <tr><td style="padding:4px;">S</td><td style="padding:4px;">7〜9号</td><td style="padding:4px;">155〜165cm</td></tr>
                        <tr><td style="padding:4px;">M</td><td style="padding:4px;">9〜11号</td><td style="padding:4px;">165〜172cm</td></tr>
                        <tr><td style="padding:4px;">L</td><td style="padding:4px;">11〜13号</td><td style="padding:4px;">172〜178cm</td></tr>
                        <tr><td style="padding:4px;">XL</td><td style="padding:4px;">13〜15号</td><td style="padding:4px;">178〜185cm</td></tr>
                    </table>
                    <p style="margin-top:6px;">👖 ボトムスはウエスト(cm)、👟 靴は実寸(cm)で入力するのがおすすめ。</p>
                    <p style="margin-top:4px; opacity:0.8;">※ブランドにより差があります。あくまで目安です。</p>
                    <button type="button" onclick="toggleSizeChart()" class="btn-outline text-center" style="margin-top:10px; padding:8px; font-size:0.8rem;">閉じる</button>
                </div>
            </div>` : ''}

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

// フォームの単一選択（スクロール位置を保持）
window.setFormSingle = function(group, val) {
    currentEditData[group] = val;
    if (group === 'category') {
        // カテゴリ変更時は種類ボタンが変わるので部分的に再描画
        const subs = CATEGORIES[val];
        currentEditData.subCategory = (subs && subs.length > 0) ? subs[0] : "";
        // 入力中のメモ・サイズを保持してから再描画
        const memoEl = document.getElementById('input-memo'); if (memoEl) currentEditData.memo = memoEl.value;
        const sizeEl = document.getElementById('input-size'); if (sizeEl) currentEditData.size = sizeEl.value;
        const mc = document.querySelector('.modal-content');
        const scrollPos = mc?.scrollTop || 0;
        renderEditFormContent();
        if (mc) requestAnimationFrame(() => { mc.scrollTop = scrollPos; });
    } else {
        // それ以外はボタンのactive状態だけ更新（再描画なし）
        document.querySelectorAll(`[data-group="${group}"]`).forEach(btn => {
            btn.classList.toggle('active', btn.dataset.val === val);
        });
    }
};

// サイズチャートの表示/非表示を切り替え
window.toggleSizeChart = function() {
    const el = document.getElementById('size-chart');
    if (el) el.classList.toggle('hidden');
};

// フォームの複数選択（再描画なし）
window.toggleFormMulti = function(group, val) {
    if (!currentEditData[group]) currentEditData[group] = [];
    const arr = currentEditData[group];
    if (arr.includes(val)) arr.splice(arr.indexOf(val), 1);
    else arr.push(val);
    // クリックされたボタンのactive状態だけ更新
    const btn = document.querySelector(`[data-group="${group}"][data-val="${val}"]`);
    if (btn) btn.classList.toggle('active', arr.includes(val));
};

async function saveItemData(isNew, existingId) {
    if (!currentUser) return;
    const btnSave = document.getElementById('btn-save-item');
    if (!btnSave) return;
    btnSave.innerHTML = `<i data-lucide="loader" class="spinner inline-icon"></i> 保存中...`;
    btnSave.disabled = true;
    lucide.createIcons();

    currentEditData.memo = document.getElementById('input-memo')?.value || '';
    currentEditData.size = document.getElementById('input-size')?.value || '';

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
                memo: currentEditData.memo,
                size: currentEditData.size
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
                memo: currentEditData.memo,
                size: currentEditData.size
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
    const categoryMap = {
        'トップス・アウター': ['トップス', 'アウター', 'トップス・アウター'],
        'ワンピース': ['ワンピース', 'ドレス'],
        'ボトムス': ['ボトムス'],
        '靴': ['靴'],
        '帽子': ['帽子'],
        '小物': ['小物'],
    };
    const cats = categoryMap[slot] || [slot];
    const items = closetItems.filter(i => cats.includes(i.category));
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

// コーデ検証ルーム レンダリング
function renderCoordRoom() {
    const slotBtn = (label, slotKey, item, onclick, clearKey) => {
        if (item) {
            return `<div class="coord-slot" style="position:relative;">
                <img src="${item.image}" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">
                <div style="position:absolute; top:4px; right:4px; background:rgba(0,0,0,0.6); color:white; border-radius:50%; width:22px; height:22px; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px;" onclick="clearCoord('${clearKey}')">✕</div>
                <div style="font-size:0.7rem; text-align:center; margin-top:4px; color:var(--text-secondary);">${label}</div>
            </div>`;
        }
        return `<div class="coord-slot" onclick="${onclick}" style="cursor:pointer; opacity:0.7;">
            <span style="font-size:0.8rem; color:var(--text-secondary);">${label}</span>
        </div>`;
    };

    // ステップ1: タイプ未選択
    if (!coordState.type) {
        return `
        <p style="font-size:0.85rem; font-weight:600; margin-bottom:12px;">① トップスの種類を選んでください</p>
        <div style="display:flex; gap:10px;">
            <button onclick="setCoordType('tops')" style="flex:1; padding:14px; background:var(--primary-light); border:2px solid var(--primary-color); border-radius:10px; color:var(--primary-color); font-weight:600; cursor:pointer;">
                👕 トップス・アウター
            </button>
            <button onclick="setCoordType('onepiece')" style="flex:1; padding:14px; background:var(--primary-light); border:2px solid var(--accent-color); border-radius:10px; color:var(--accent-color); font-weight:600; cursor:pointer;">
                👗 ワンピース
            </button>
        </div>`;
    }

    let html = '';

    // トップス/ワンピース スロット
    if (coordState.type === 'tops') {
        html += `<p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px;">① トップス・アウター</p>
        <div class="coord-slots" style="margin-bottom:12px;">
            ${slotBtn('トップス・アウターを選ぶ', 'tops', coordState.tops, "openCoordPicker('トップス・アウター')", 'tops')}
        </div>`;
        if (coordState.tops) {
            html += `<p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px;">② ボトムス</p>
            <div class="coord-slots" style="margin-bottom:12px;">
                ${slotBtn('ボトムスを選ぶ', 'bottoms', coordState.bottoms, "openCoordPicker('ボトムス')", 'bottoms')}
            </div>`;
        }
    } else {
        html += `<p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px;">① ワンピース</p>
        <div class="coord-slots" style="margin-bottom:12px;">
            ${slotBtn('ワンピースを選ぶ', 'onepiece', coordState.tops, "openCoordPicker('ワンピース')", 'tops')}
        </div>`;
    }

    const mainSelected = coordState.type === 'tops' ? coordState.tops : coordState.tops;
    const step = coordState.type === 'tops' ? (mainSelected && coordState.bottoms ? 3 : mainSelected ? 2 : 1) : (mainSelected ? 2 : 1);
    const showOptionals = (coordState.type === 'tops' && coordState.bottoms) || (coordState.type === 'onepiece' && coordState.tops);

    if (showOptionals) {
        const shoeStep = coordState.type === 'tops' ? '③' : '②';
        const hatStep  = coordState.type === 'tops' ? '④' : '③';
        const accStep  = coordState.type === 'tops' ? '⑤' : '④';
        html += `<p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px;">${shoeStep} 靴（任意）</p>
        <div class="coord-slots" style="margin-bottom:12px;">
            ${slotBtn('靴を選ぶ（任意）', 'shoes', coordState.shoes, "openCoordPicker('靴')", 'shoes')}
        </div>
        <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px;">${hatStep} 帽子（任意）</p>
        <div class="coord-slots" style="margin-bottom:12px;">
            ${slotBtn('帽子を選ぶ（任意）', 'hat', coordState.hat, "openCoordPicker('帽子')", 'hat')}
        </div>
        <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px;">${accStep} 小物（任意）</p>
        <div class="coord-slots" style="margin-bottom:12px;">
            ${slotBtn('小物を選ぶ（任意）', 'accessory', coordState.accessory, "openCoordPicker('小物')", 'accessory')}
        </div>
        <button onclick="analyzeCoordination()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-bottom:8px;">
            <i data-lucide="sparkles" class="inline-icon"></i> AIで分析する
        </button>`;
    }

    html += `<button onclick="resetCoord()" class="btn-outline text-center" style="font-size:0.8rem; padding:8px; margin-top:4px;">最初からやり直す</button>`;
    html += `<div id="coord-result" class="hidden mt-4" style="background:var(--primary-light); padding:16px; border-radius:8px; font-size:0.9rem; line-height:1.5;"></div>`;
    return html;
}

function refreshCoordRoom() {
    const room = document.getElementById('coord-room');
    if (room) {
        room.innerHTML = `<p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">手持ちの服を組み合わせてAIの評価を聞いてみよう！</p>` + renderCoordRoom();
        lucide.createIcons();
    }
}

window.setCoordType = function(type) {
    coordState.type = type;
    coordState.tops = coordState.bottoms = coordState.shoes = coordState.hat = coordState.accessory = null;
    refreshCoordRoom();
};

window.resetCoord = function() {
    coordState = { type: null, tops: null, bottoms: null, shoes: null, hat: null, accessory: null };
    refreshCoordRoom();
};

window.selectForCoord = function(id) {
    const item = closetItems.find(i => i.id === id);
    if (currentTargetSlot === 'トップス・アウター' || currentTargetSlot === 'ワンピース') coordState.tops = item;
    else if (currentTargetSlot === 'ボトムス') coordState.bottoms = item;
    else if (currentTargetSlot === '靴') coordState.shoes = item;
    else if (currentTargetSlot === '帽子') coordState.hat = item;
    else if (currentTargetSlot === '小物') coordState.accessory = item;
    closeModal();
    refreshCoordRoom();
};

window.clearCoord = function(slotKey) {
    coordState[slotKey] = null;
    refreshCoordRoom();
};

window.analyzeCoordination = async function() {
    const resEl = document.getElementById('coord-result');
    if (!resEl) return;

    const main = coordState.tops;
    if (!main) {
        resEl.innerHTML = `<span style="color:#ef4444;"><i data-lucide="alert-circle" class="inline-icon"></i> メインアイテムを選択してください！</span>`;
        resEl.classList.remove('hidden');
        lucide.createIcons();
        return;
    }

    resEl.innerHTML = `<i data-lucide="loader" class="spinner inline-icon"></i> AIが分析中...`;
    resEl.classList.remove('hidden');
    lucide.createIcons();

    const describe = item => `${item.subCategory || item.category}（色:${(item.colors||[]).join('・') || '未登録'}、明るさ:${item.lightness || '指定なし'}、スタイル:${(item.styles||[]).join('・') || '未登録'}、季節:${(item.seasons||[]).join('・') || '指定なし'}）`;

    let itemsDesc = coordState.type === 'tops'
        ? `トップス：${describe(main)}`
        : `ワンピース：${describe(main)}`;
    if (coordState.bottoms)  itemsDesc += `\nボトムス：${describe(coordState.bottoms)}`;
    if (coordState.shoes)    itemsDesc += `\n靴：${describe(coordState.shoes)}`;
    if (coordState.hat)      itemsDesc += `\n帽子：${describe(coordState.hat)}`;
    if (coordState.accessory) itemsDesc += `\n小物：${describe(coordState.accessory)}`;

    try {
        const prompt = `あなたはプロのスタイリストです。次の手持ちアイテムの組み合わせを評価し、JSONのみで返してください。
${itemsDesc}

ルール:
- 評価は上記の登録データのみに基づくこと。写真は見ていないので実際の色・柄・素材を想像しないこと。色は登録データの色をそのまま使うこと。
- 各項目は日本語で簡潔に書くこと。
返すJSONの形式:
{"score": 1〜5の整数, "good": "良い点(1〜2文)", "improve": "改善点(1〜2文)", "plus": "小物や着こなしの工夫(一言)"}`;
        const result = await callGemini(prompt, null, { json: true });
        if (result) {
            let data = null;
            try { data = JSON.parse(result); } catch { data = null; }
            if (data && data.score) {
                const n = Math.max(1, Math.min(5, parseInt(data.score) || 3));
                const stars = `<div style="font-size:1.2rem; color:var(--accent-color); margin-bottom:8px;">${'★'.repeat(n)}${'☆'.repeat(5 - n)} <span style="font-size:0.85rem; color:var(--text-secondary);">${n}/5</span></div>`;
                resEl.innerHTML = `<strong>✨ AI分析結果</strong>${stars}` +
                    `<p style="margin-bottom:6px;"><strong>良い点：</strong>${data.good || '―'}</p>` +
                    `<p style="margin-bottom:6px;"><strong>改善点：</strong>${data.improve || '―'}</p>` +
                    `<p><strong>プラス提案：</strong>${data.plus || '―'}</p>`;
            } else {
                // 万一JSONで返らなかった場合は素のテキストを表示
                resEl.innerHTML = `<strong>✨ AI分析結果</strong><br>${result.replace(/\n/g, '<br>')}`;
            }
            return;
        }
    } catch (e) {
        console.error("コーデ分析エラー:", e);
        resEl.innerHTML = `<strong>⚠️ AI分析エラー</strong><br>しばらく時間をおいて再試行してください。`;
    }
};

// =============================================
// 着用履歴 表示・詳細・編集・削除・追加
// =============================================

// 旧スキーマ（title/image/closetItemId）と新スキーマ（items[]）の両対応
function getHistoryDisplayData(h) {
    if (h.items && h.items.length > 0) {
        const imgs = h.items.map(it => it.image).filter(Boolean);
        const title = h.items.map(it => it.title || it.subCategory || it.category).filter(Boolean).join(' × ') || 'コーデ記録';
        return { images: imgs, title, occasion: h.occasion || '' };
    } else {
        // 旧スキーマ（後方互換）
        const img = h.image || null;
        return { images: img ? [img] : [], title: h.title || 'コーデ記録', occasion: '' };
    }
}

window.setHistoryView = function(view) {
    historyView = view;
    localStorage.setItem('history_view', view);
    navigate('history');
};

function renderHistoryList() {
    if (wearHistory.length === 0) {
        return `<div class="card"><p style="color:var(--text-secondary); font-size:0.9rem;">まだ履歴がありません。<br>ホーム画面のコーデから「今日着た！」を押すか、上のボタンから手動で記録できます。</p></div>`;
    }

    // ソート（新しい順がデフォルト）
    const sorted = [...wearHistory].sort((a, b) =>
        historySortOrder === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
    );

    let html = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <span style="font-size:0.8rem; color:var(--text-secondary);">${wearHistory.length}件の記録</span>
        <button onclick="toggleHistorySort()" style="background:none; border:1px solid var(--primary-color); color:var(--primary-color); border-radius:20px; padding:4px 12px; font-size:0.78rem; cursor:pointer; font-weight:600;">
            ${historySortOrder === 'newest' ? '↓ 新しい順' : '↑ 古い順'}
        </button>
    </div>
    <div class="card"><div style="display:flex; flex-direction:column; gap:14px;">`;

    sorted.forEach(h => {
        const display = getHistoryDisplayData(h);
        const thumbSize = display.images.length > 1 ? '52px' : '72px';
        const thumbsHtml = display.images.slice(0, 3).map(img =>
            `<img src="${img}" style="width:${thumbSize}; height:72px; border-radius:8px; object-fit:cover; cursor:pointer;" onclick="openHistoryDetail('${h.id}')" alt="outfit">`
        ).join('');
        const occasionBadge = display.occasion
            ? `<span style="font-size:0.7rem; background:var(--primary-light); color:var(--primary-color); border-radius:10px; padding:1px 7px; margin-left:4px;">${display.occasion}</span>`
            : '';

        html += `
        <div style="display:flex; gap:10px; border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:12px; align-items:center;">
            <div style="display:flex; gap:4px; flex-shrink:0;">${thumbsHtml}</div>
            <div style="flex:1; min-width:0; cursor:pointer;" onclick="openHistoryDetail('${h.id}')">
                <p style="font-size:0.75rem; color:var(--primary-color); font-weight:bold;">${h.dateStr}</p>
                <div style="display:flex; align-items:center; flex-wrap:wrap; margin-top:3px;">
                    <p style="font-size:0.88rem; font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:calc(100% - 60px);">${display.title}</p>
                    ${occasionBadge}
                </div>
                ${h.memo ? `<p style="font-size:0.73rem; color:var(--text-secondary); margin-top:2px;">${h.memo}</p>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:2px; flex-shrink:0;">
                <button onclick="openHistoryEdit('${h.id}')" style="background:none; border:none; color:var(--primary-color); cursor:pointer; padding:6px;">
                    <i data-lucide="pencil" style="width:15px; height:15px;"></i>
                </button>
                <button onclick="deleteHistoryItem('${h.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:6px;">
                    <i data-lucide="trash-2" style="width:15px; height:15px;"></i>
                </button>
            </div>
        </div>`;
    });
    html += `</div></div>`;
    return html;
}

window.toggleHistorySort = function() {
    historySortOrder = historySortOrder === 'newest' ? 'oldest' : 'newest';
    localStorage.setItem('history_sort', historySortOrder);
    navigate('history');
};

// 予定（ユーザー自身が入力）：端末内（localStorage）にユーザー別・日付別で保存
function getSchedule(iso) {
    if (!currentUser) return '';
    return localStorage.getItem(`schedule_${currentUser.uid}_${iso}`) || '';
}
// 1週間分の自前予定を calendarEvents に反映（ホームのコーデ提案・予定バッジに使う）
function loadSchedulesIntoEvents() {
    weeklyOutfits.forEach(o => {
        const s = getSchedule(o.isoDate);
        if (s) calendarEvents[o.isoDate] = s;
        else delete calendarEvents[o.isoDate];
    });
}
window.saveSchedule = function(iso) {
    const val = (document.getElementById('day-schedule-input')?.value || '').trim();
    if (currentUser) {
        if (val) localStorage.setItem(`schedule_${currentUser.uid}_${iso}`, val);
        else localStorage.removeItem(`schedule_${currentUser.uid}_${iso}`);
    }
    loadSchedulesIntoEvents();
    if (isDataLoaded && (closetItems.length || wearHistory.length)) generateWeeklyOutfitsFromCloset();
    closeModal();
    navigate(currentRoute === 'home' ? 'home' : 'history'); // カレンダー/ホームを更新
};

function renderHistoryCalendar() {
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const monthStr = calendarMonth.toLocaleDateString('ja-JP', {year:'numeric', month:'long'});

    // 月の日数と最初の曜日
    const firstDay = new Date(y, m, 1).getDay(); // 0=日
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // 履歴をisoDate別にインデックス化
    const historyByDate = {};
    wearHistory.forEach(h => {
        const iso = h.isoDate || (h.createdAt ? new Date(h.createdAt).toISOString().split('T')[0] : null);
        if (iso && iso.startsWith(`${y}-${String(m+1).padStart(2,'0')}`)) {
            if (!historyByDate[iso]) historyByDate[iso] = [];
            historyByDate[iso].push(h);
        }
    });

    let html = `
    <div class="card">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
            <button onclick="shiftCalendarMonth(-1)" style="background:none; border:none; cursor:pointer; color:var(--primary-color); padding:4px 8px; font-size:1.2rem;">‹</button>
            <span style="font-weight:bold; font-size:1rem;">${monthStr}</span>
            <button onclick="shiftCalendarMonth(1)" style="background:none; border:none; cursor:pointer; color:var(--primary-color); padding:4px 8px; font-size:1.2rem;">›</button>
        </div>
        <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:4px; text-align:center;">
            ${['日','月','火','水','木','金','土'].map((d,i) => `<div style="font-size:0.7rem; font-weight:bold; color:${i===0?'#ef4444':i===6?'#3b82f6':'var(--text-secondary)'}; padding:4px 0;">${d}</div>`).join('')}
        `;

    // 空白セル
    for (let i = 0; i < firstDay; i++) html += `<div></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
        const iso = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const items = historyByDate[iso] || [];
        const today = new Date().toISOString().split('T')[0];
        const isToday = iso === today;
        const dow = new Date(y, m, day).getDay();
        const color = dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : 'var(--text-primary)';

        const hasSchedule = !!getSchedule(iso);
        html += `
        <div onclick="openHistoryDayModal('${iso}')"
            style="padding:6px 2px; border-radius:8px; cursor:pointer;
            background:${isToday ? 'var(--primary-light)' : (items.length > 0 || hasSchedule) ? 'rgba(14,165,233,0.08)' : 'transparent'};
            border:${isToday ? '1.5px solid var(--primary-color)' : '1.5px solid transparent'};">
            <div style="font-size:0.85rem; color:${color}; font-weight:${isToday?'bold':'normal'};">${day}</div>
            <div style="display:flex; justify-content:center; gap:2px; margin-top:2px; min-height:7px;">
                ${items.slice(0,3).map(() => '<div style="width:5px;height:5px;border-radius:50%;background:var(--primary-color);"></div>').join('')}
                ${hasSchedule ? '<div style="width:5px;height:5px;border-radius:50%;background:var(--accent-color);" title="予定あり"></div>' : ''}
            </div>
        </div>`;
    }

    html += `</div></div>`;
    return html;
}

window.shiftCalendarMonth = function(delta) {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + delta, 1);
    navigate('history');
};

window.openHistoryDayModal = function(iso) {
    const dayRecords = wearHistory.filter(h => {
        const d = h.isoDate || (h.createdAt ? new Date(h.createdAt).toISOString().split('T')[0] : null);
        return d === iso;
    });
    const dateStr = new Date(iso).toLocaleDateString('ja-JP', {year:'numeric', month:'long', day:'numeric', weekday:'short'});
    const schedule = getSchedule(iso);

    // その日の保存服の画像を集めて並べる
    const images = [];
    dayRecords.forEach(h => getHistoryDisplayData(h).images.forEach(img => images.push(img)));
    const imagesHtml = images.length > 0
        ? `<div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:8px;">
             ${images.map(src => `<img src="${src}" style="width:100%; height:90px; object-fit:cover; border-radius:8px;" alt="着用服">`).join('')}
           </div>`
        : `<p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:8px;">この日の着用記録はまだありません。</p>`;

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
            <h3 class="section-title">${dateStr}</h3>

            <label style="font-weight:600; font-size:0.9rem;">📝 予定</label>
            <input type="text" id="day-schedule-input" class="input-field" placeholder="例：友達とランチ／バイト／デート" value="${schedule.replace(/"/g, '&quot;')}" style="margin:6px 0 8px;">
            <button onclick="saveSchedule('${iso}')" style="width:100%; background:var(--primary-color); color:#fff; border:none; padding:10px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-bottom:16px;">予定を保存</button>

            <label style="font-weight:600; font-size:0.9rem;">👕 この日の着用</label>
            <div style="margin-top:8px;">${imagesHtml}</div>
            ${dayRecords.map(h => {
                const disp = getHistoryDisplayData(h);
                return `<div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(0,0,0,0.05); padding:8px 0;">
                    <span style="font-size:0.85rem;">${disp.title}${disp.occasion ? `（${disp.occasion}）` : ''}</span>
                    <button onclick="openHistoryEdit('${h.id}')" style="background:none; border:none; color:var(--primary-color); cursor:pointer;"><i data-lucide="pencil" style="width:16px; height:16px;"></i></button>
                </div>`;
            }).join('')}

            <button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

window.openHistoryDetail = function(id) {
    const h = wearHistory.find(x => x.id === id);
    if (!h) return;
    const display = getHistoryDisplayData(h);

    // 複数画像を横並びで表示
    let imagesHtml;
    if (display.images.length > 1) {
        imagesHtml = `<div style="display:flex; gap:4px; height:200px; border-radius:12px; overflow:hidden; margin-bottom:16px;">
            ${display.images.slice(0, 3).map(img =>
                `<img src="${img}" style="flex:1; object-fit:cover; min-width:0;" alt="outfit">`).join('')}
        </div>`;
    } else {
        const img = display.images[0] || 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400';
        imagesHtml = `<img src="${img}" style="width:100%; height:200px; object-fit:cover; border-radius:12px; margin-bottom:16px;" alt="outfit">`;
    }

    const occasionBadge = display.occasion
        ? `<span style="font-size:0.75rem; background:var(--primary-light); color:var(--primary-color); border-radius:12px; padding:2px 10px; display:inline-block; margin-bottom:8px;">${display.occasion}</span>`
        : '';

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">着用詳細</h3>
            ${imagesHtml}
            <p style="font-size:0.8rem; color:var(--primary-color); font-weight:bold; margin-bottom:6px;">${h.dateStr}</p>
            ${occasionBadge}
            <p style="font-size:1rem; font-weight:bold; margin-bottom:8px;">${display.title}</p>
            ${h.memo ? `<p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:16px;">${h.memo}</p>` : ''}
            <button onclick="openHistoryEdit('${h.id}')" style="width:100%; background:var(--surface-solid); color:var(--primary-color); border:2px solid var(--primary-color); padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-bottom:8px;">
                編集する
            </button>
            <button onclick="deleteHistoryItem('${h.id}'); closeModal();" style="width:100%; background:transparent; color:#ef4444; border:1px solid #ef4444; padding:10px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-bottom:8px;">
                削除する
            </button>
            <button onclick="closeModal()" class="btn-outline text-center">閉じる</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

window.openHistoryEdit = function(id) {
    closeModal(); // 詳細モーダルを閉じてから編集モーダルを開く
    const h = wearHistory.find(x => x.id === id);
    if (!h) return;
    const dateVal = h.isoDate || (h.createdAt ? new Date(h.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const display = getHistoryDisplayData(h);

    // サムネイル表示
    const thumbsHtml = display.images.length > 0
        ? display.images.slice(0, 4).map(img =>
            `<img src="${img}" style="width:60px; height:60px; border-radius:8px; object-fit:cover;">`).join('')
        : `<span style="color:var(--text-secondary); font-size:0.85rem;">服の選択なし</span>`;

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:85vh; overflow-y:auto;">
            <h3 class="section-title">着用履歴を編集</h3>
            <div style="display:flex; gap:6px; margin-bottom:16px; flex-wrap:wrap; align-items:center;">${thumbsHtml}</div>
            <div class="form-group">
                <label style="font-weight:600; font-size:0.9rem;">着用日</label>
                <input type="date" id="edit-history-date" class="input-field" value="${dateVal}" style="margin-top:6px;">
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-weight:600; font-size:0.9rem;">シーン（任意）</label>
                <input type="text" id="edit-history-occasion" class="input-field" value="${h.occasion || ''}" placeholder="例：仕事、デートなど" style="margin-top:6px;">
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-weight:600; font-size:0.9rem;">メモ（任意）</label>
                <input type="text" id="edit-history-memo" class="input-field" value="${h.memo || ''}" placeholder="例：暑かった、気に入った組み合わせ" style="margin-top:6px;">
            </div>
            <button onclick="saveHistoryEdit('${id}')" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-top:16px; margin-bottom:8px;">保存する</button>
            <button onclick="closeModal()" class="btn-outline text-center">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

window.saveHistoryEdit = async function(id) {
    const dateInput  = document.getElementById('edit-history-date')?.value;
    const occasion   = document.getElementById('edit-history-occasion')?.value?.trim() || '';
    const memo       = document.getElementById('edit-history-memo')?.value?.trim() || '';
    if (!dateInput) { alert('着用日を入力してください。'); return; }

    const dateObj = new Date(dateInput);
    const dateStr = dateObj.toLocaleDateString('ja-JP', {year:'numeric', month:'long', day:'numeric'}) + ' 着用';
    const isoDate = dateInput;

    try {
        await updateDoc(doc(db, "history", id), { occasion, memo, dateStr, isoDate, createdAt: dateObj.getTime() });
        const idx = wearHistory.findIndex(h => h.id === id);
        if (idx !== -1) Object.assign(wearHistory[idx], { occasion, memo, dateStr, isoDate, createdAt: dateObj.getTime() });
        wearHistory.sort((a, b) => b.createdAt - a.createdAt);
        closeModal();
        navigate('history');
    } catch(e) {
        alert('保存に失敗しました。');
        console.error(e);
    }
};

// =============================================
// 着用履歴 削除・手動追加
// =============================================
window.deleteHistoryItem = async function(id) {
    if (!confirm('この着用履歴を削除しますか？\nこの操作は取り消せません。')) return;
    try {
        await deleteDoc(doc(db, "history", id));
        wearHistory = wearHistory.filter(h => h.id !== id);
        navigate('history');
    } catch(e) {
        alert('削除に失敗しました。');
        console.error(e);
    }
};

window.openAddHistoryModal = function() {
    const today = new Date().toISOString().split('T')[0];
    selectedHistoryItems = new Set(); // リセット
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:85vh; overflow-y:auto;">
            <h3 class="section-title">👗 着用を記録する</h3>
            <div class="form-group">
                <label style="font-weight:600; font-size:0.9rem;">着用日</label>
                <input type="date" id="history-date" class="input-field" value="${today}" style="margin-top:6px;">
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-weight:600; font-size:0.9rem;">シーン（任意）</label>
                <input type="text" id="history-occasion" class="input-field" placeholder="例：仕事、デート、普段着など" style="margin-top:6px;">
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-weight:600; font-size:0.9rem;">メモ（任意）</label>
                <input type="text" id="history-memo" class="input-field" placeholder="例：暑かった、気に入った組み合わせ" style="margin-top:6px;">
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-weight:600; font-size:0.9rem;">服を選ぶ（複数選択可）</label>
                <p style="font-size:0.75rem; color:var(--text-secondary); margin:4px 0 8px;">クローゼットからタップして選択（省略可）</p>
                <div class="closet-grid" style="max-height:240px; overflow-y:auto;">
                    ${closetItems.length === 0
                        ? '<p style="color:var(--text-secondary); font-size:0.85rem;">クローゼットに服がありません</p>'
                        : closetItems.map(item => `
                            <div class="closet-item" id="hist-item-${item.id}" onclick="toggleHistoryItem('${item.id}')" style="cursor:pointer;">
                                <img src="${item.image}" alt="">
                                <div class="item-tags"><span class="tag-small">${item.subCategory || item.category}</span></div>
                            </div>`).join('')
                    }
                </div>
            </div>
            <button onclick="saveManualHistory()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-top:16px; margin-bottom:8px;">保存する</button>
            <button onclick="closeModal()" class="btn-outline text-center">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

let selectedHistoryItems = new Set(); // 複数選択対応
window.toggleHistoryItem = function(id) {
    if (selectedHistoryItems.has(id)) {
        selectedHistoryItems.delete(id);
        document.getElementById('hist-item-' + id)?.classList.remove('selected');
    } else {
        selectedHistoryItems.add(id);
        document.getElementById('hist-item-' + id)?.classList.add('selected');
    }
};

window.saveManualHistory = async function() {
    if (!currentUser) return;
    const dateInput = document.getElementById('history-date')?.value;
    const occasion  = document.getElementById('history-occasion')?.value?.trim() || '';
    const memo      = document.getElementById('history-memo')?.value?.trim() || '';
    if (!dateInput) { alert('着用日を入力してください。'); return; }

    const dateObj = new Date(dateInput);
    const dateStr = dateObj.toLocaleDateString('ja-JP', {year:'numeric', month:'long', day:'numeric'}) + ' 着用';
    const isoDate = dateInput;

    // 選択アイテムをitems配列に変換
    const items = [...selectedHistoryItems].map(id => {
        const ci = closetItems.find(i => i.id === id);
        if (!ci) return null;
        return {
            closetItemId: ci.id,
            image: ci.image,
            category: ci.category,
            subCategory: ci.subCategory || '',
            title: ci.subCategory || ci.category
        };
    }).filter(Boolean);

    try {
        const docData = {
            userId: currentUser.uid,
            dateStr, isoDate, occasion, items, memo,
            createdAt: dateObj.getTime()
        };
        const docRef = await addDoc(collection(db, "history"), docData);
        wearHistory.unshift({ id: docRef.id, ...docData });
        wearHistory.sort((a, b) => b.createdAt - a.createdAt);
        selectedHistoryItems = new Set();
        closeModal();
        navigate('history');
    } catch(e) {
        alert('保存に失敗しました。');
        console.error(e);
    }
};

// =============================================
// グローバル関数
// =============================================
window.closeModal = function() { modalContainer.classList.add('hidden'); };

window.setTheme = function(themeName) {
    document.body.className = `theme-${themeName}`;
    localStorage.setItem('ai-closet-theme', themeName);
    // スマホのブラウザUIの色（meta theme-color）もテーマに合わせる
    const t = THEMES.find(x => x.id === themeName);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && t) meta.setAttribute('content', t.color);
    updateThemeButtons();
};

function updateThemeButtons() {
    const currentTheme = localStorage.getItem('ai-closet-theme') || 'morning';
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === currentTheme);
    });
}

window.testAIConnection = async function() {
    const resultEl = document.getElementById('ai-test-result');
    const btn = document.getElementById('btn-ai-test');
    if (!resultEl) return;
    resultEl.style.display = 'block';
    resultEl.innerHTML = '<i data-lucide="loader" class="spinner inline-icon"></i> テスト中...';
    if (btn) { btn.disabled = true; }
    lucide.createIcons();

    try {
        const res = await callGemini('「テスト成功」とだけ日本語で返してください。');
        if (res) {
            resultEl.innerHTML =
                `<span style="color:#10b981; font-weight:bold;">✅ AI接続成功！</span><br>` +
                `<span style="color:var(--text-secondary);">返答: ${res}</span>`;
        } else {
            resultEl.innerHTML =
                `<span style="color:#f59e0b; font-weight:bold;">⚠️ 接続できましたが返答が空でした</span>`;
        }
    } catch(e) {
        const msg = e.message || '';
        let detail = msg;
        let hint = '';

        if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
            hint = '💡 Cloudflare WorkerのURL、またはALLOWED_ORIGINの設定を確認してください。';
        } else if (msg.includes('400') || msg.toLowerCase().includes('api key')) {
            hint = '💡 Cloudflare WorkerにGEMINI_API_KEYシークレットが正しく設定されているか確認してください。Workerを再デプロイすると反映されます。';
        } else if (msg.includes('500') || msg.includes('502')) {
            hint = '💡 CloudflareのWorkerが正しくデプロイされているか確認してください。';
        } else if (msg.toLowerCase().includes('failed to fetch') || msg.includes('network')) {
            hint = '💡 Worker URLが正しいか、またはWorkerが稼働中か確認してください。';
        } else {
            hint = '💡 Cloudflare Dashboard → Workers → ai-closet-gemini → Settings → Variables and Secrets でGEMINI_API_KEYが設定されているか確認してください。';
        }

        resultEl.innerHTML =
            `<span style="color:#ef4444; font-weight:bold;">❌ AI接続エラー</span><br>` +
            `<span style="font-size:0.8rem; color:var(--text-secondary);">${detail}</span>` +
            (hint ? `<br><br><span style="font-size:0.8rem; color:#f59e0b;">${hint}</span>` : '');
    }

    if (btn) { btn.disabled = false; }
    lucide.createIcons();
};

window.connectGoogleCalendar = function() {
    if (!googleTokenClient) {
        alert("Google APIの準備中です。数秒後にお試しください。");
        return;
    }
    googleTokenClient.requestAccessToken();
};

window.refreshCalendar = function() {
    if (!googleTokenClient) {
        alert("Google APIの準備中です。数秒後にお試しください。");
        return;
    }
    calendarStatusMsg = "🔄 予定を更新中...";
    if (currentRoute === 'settings') navigate('settings');
    // prompt:'' = すでに許可済みなら確認画面を出さずに再取得
    googleTokenClient.requestAccessToken({ prompt: '' });
};

window.disconnectCalendar = function() {
    if (!confirm("Googleカレンダーの連携を解除しますか？")) return;
    isCalendarConnected = false;
    calendarEvents = {};
    calendarStatusMsg = "";
    localStorage.removeItem('google_calendar_connected');
    if (isDataLoaded && (closetItems.length || wearHistory.length)) generateWeeklyOutfitsFromCloset();
    navigate('settings');
};

// =============================================
// 初期化
// =============================================
function init() {
    const savedTheme = localStorage.getItem('ai-closet-theme') || 'morning';
    window.setTheme(savedTheme);
    mainContent.style.transition = 'opacity 0.15s ease';
    setTimeout(() => { initGoogleAuth(); }, 1000);
    fetchWeather();
    navigate('home');
    setTimeout(() => { lucide.createIcons(); }, 50);
}

init();
