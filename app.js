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
// マネキン試着（VTON・評価版）用の別Worker。※本番のWORKER_URLとは別に用意する（未設定だと試着は「準備中」表示）。
const VTON_WORKER_URL = 'https://REPLACE-WITH-YOUR-VTON-WORKER.workers.dev';

const CATEGORIES = {
    "トップス": ["カットソー", "Tシャツ", "ロゴTシャツ", "タンクトップ", "シャツ", "柄シャツ", "ブラウス", "スウェット", "パーカ", "ニット/セーター"],
    "アウター": ["ジャケット", "ブルゾン", "コート", "トレンチコート", "ダウンジャケット", "レザージャケット", "デニムジャケット", "マウンテンパーカ", "カーディガン", "ジレ・ベスト"],
    "ボトムス": ["デニム", "チノパン", "カーゴパンツ", "スラックス", "ショートパンツ", "クロップパンツ", "バミューダパンツ", "カプリパンツ", "スキニーパンツ", "サルエルパンツ", "テーパードパンツ", "ワイドパンツ", "ガウチョパンツ", "バギーパンツ", "その他のボトムス"],
    "帽子": ["ハット", "キャップ", "ニット帽", "その他の帽子"],
    "靴": ["スニーカー", "革靴", "ブーツ", "サンダル", "パンプス", "フラットシューズ"],
    "ワンピース": [],
    "ドレス": [],
    "スーツ": [],
    "小物": ["バッグ", "ベルト", "ネクタイ", "アクセサリー", "眼鏡", "サングラス", "時計", "マフラー", "手袋", "ストール", "スカーフ", "その他の小物"]
};
const GENDERS = ["メンズ", "レディース", "男女兼用"];
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
let isGuest = false; // ログインせず「お試しモード」で使っているか
const GUEST_MAX_ITEMS = 10; // お試しモードのクローゼット上限
// 設定・予定などのlocalStorageキー用（ログイン=uid、ゲスト=guest）
function userKey() { return currentUser ? currentUser.uid : (isGuest ? 'guest' : null); }
// ゲストの保存先は sessionStorage（タブ/ブラウザを閉じると消える＝同じ端末でも別のゲストとデータがかぶらない）。
// ログイン済みは localStorage（端末に保存して次回も使える）。
function userStore() { return isGuest ? sessionStorage : localStorage; }
let googleTokenClient;
let isCalendarConnected = false;
let calendarEvents = {};
let calendarStatusMsg = '';

// 位置情報（localStorageにのみ保存・ユーザー別。Firebaseには送らない）
let userLocation = null;

// ログイン中ユーザーの保存設定（位置情報・カレンダー連携）を読み込む
function loadUserPrefs() {
    const key = userKey();
    if (!key) { userLocation = null; isCalendarConnected = false; return; }
    try { userLocation = JSON.parse(userStore().getItem(`user_location_${key}`) || 'null'); }
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
let closetSort = localStorage.getItem('closet_sort') || 'newest'; // クローゼット画像の並び順: 'newest' | 'oldest' | 'category'
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

    // 429（混雑/無料枠レート制限）・503（一時的）やネットワーク不調は、待って自動リトライ。
    // 無料枠の「1分あたり上限」は数秒で戻るため、指数バックオフで吸収する。
    const MAX_ATTEMPTS = 3;
    let lastErr = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let response;
        try {
            response = await fetch(WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, imageBase64: base64Data, mimeType, json: opts.json || false, imageUrl: opts.imageUrl || null })
            });
        } catch (netErr) {
            lastErr = netErr;
            if (attempt < MAX_ATTEMPTS - 1) { await sleep(1200 * (attempt + 1)); continue; }
            throw new Error('通信に失敗しました。電波の良い場所で再度お試しください。');
        }

        if (response.ok) {
            const data = await response.json();
            return data.choices?.[0]?.message?.content || null;
        }

        // 混雑・一時エラーは待って再試行（最後の試行を除く）
        if ((response.status === 429 || response.status === 503) && attempt < MAX_ATTEMPTS - 1) {
            await sleep(1500 * Math.pow(2, attempt) + Math.floor(Math.random() * 500)); // 指数バックオフ＋ゆらぎ
            continue;
        }

        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `APIエラー (${response.status})`);
    }
    throw lastErr || new Error('AIが混雑しています。少し待って再度お試しください。');
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
            if (userKey()) userStore().setItem(`user_location_${userKey()}`, JSON.stringify(userLocation));
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
    if (userKey()) userStore().removeItem(`user_location_${userKey()}`);
    fetchWeather();
    navigate('settings');
};

// =============================================
// 認証
// =============================================
onAuthStateChanged(auth, (user) => {
    // ⚠️ お試し（ゲスト）モード中は、端末に残っていた別アカウントのログインセッションを一切反映しない。
    // （共有端末などで他人のクローゼット画像が流入するのを防ぐ）。残存セッションはサインアウトして掃除する。
    if (isGuest) {
        if (user) { signOut(auth).catch(() => {}); }
        return;
    }
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

// ログイン画面のタブ切替（ログイン / 新規登録）。選んだ方だけ大きく出して導線を明確にする。
window.setAuthMode = function(mode) {
    const isReg = mode === 'register';
    const tabLogin = document.getElementById('auth-tab-login');
    const tabReg   = document.getElementById('auth-tab-register');
    const btnLogin = document.getElementById('btn-email-login');
    const btnReg   = document.getElementById('btn-email-register');
    const hint     = document.getElementById('auth-mode-hint');
    if (authError) authError.textContent = '';
    if (tabLogin && tabReg) {
        tabLogin.style.background = isReg ? 'transparent' : 'var(--primary-color)';
        tabLogin.style.color      = isReg ? 'var(--primary-color)' : '#fff';
        tabReg.style.background    = isReg ? 'var(--primary-color)' : 'transparent';
        tabReg.style.color         = isReg ? '#fff' : 'var(--primary-color)';
    }
    if (btnLogin) btnLogin.style.display = isReg ? 'none' : '';
    if (btnReg)   btnReg.style.display   = isReg ? '' : 'none';
    if (hint) hint.textContent = isReg
        ? '初めての方：メールとパスワード（6文字以上）でアカウントを作成します'
        : 'アカウントをお持ちの方：メールとパスワードでログイン';
};
setAuthMode('login'); // 既定はログイン

window.logout = async function() {
    if (isGuest) {
        // ゲストはログアウト＝お試し終了。ログイン画面に戻す（端末内データは残す）
        isGuest = false;
        closetItems = []; wearHistory = []; isDataLoaded = false;
        weeklyOutfits = buildInitialWeeklyOutfits();
        authOverlay.classList.remove('hidden');
        return;
    }
    if (confirm("ログアウトしますか？")) {
        await signOut(auth);
        navigate('home');
    }
};

// ===== お試し（ゲスト）モード =====
function saveGuestCloset() { try { sessionStorage.setItem('guest_closet', JSON.stringify(closetItems)); } catch(e){} }
function saveGuestHistory() { try { sessionStorage.setItem('guest_history', JSON.stringify(wearHistory)); } catch(e){} }
// ゲストが初めて保存する直前に1回だけ確認（セッション中は再表示しない）。文言は実際の挙動に一致させる（タブ/ブラウザを閉じると消える。再読み込みでは残る）。
function guestSaveConfirm() {
    if (!isGuest) return true;
    if (sessionStorage.getItem('guest_notice_shown') === '1') return true;
    const ok = confirm('【お試しモード】\nここで保存するデータは、このブラウザの「お試し」中だけ保存されます。\n\n・タブやブラウザを閉じると消えます\n・他の人や他の端末には表示されません\n\nずっと残す・他の端末でも見るには、ログイン（登録）してください。\n\nこのまま保存しますか？');
    if (ok) sessionStorage.setItem('guest_notice_shown', '1');
    return ok;
}

window.skipLogin = function() {
    isGuest = true;
    currentUser = null;
    // 端末に別アカウントのログインセッションが残っていたら掃除（ゲストに他人のデータが混ざらないように）。
    // signOut は onAuthStateChanged(null) を発火させるが、上の isGuest ガードで無害化される。
    try { if (auth.currentUser) signOut(auth).catch(() => {}); } catch(e) {}
    authOverlay.classList.add('hidden');
    // 端末内のお試しデータを読み込み
    try { closetItems = JSON.parse(sessionStorage.getItem('guest_closet') || '[]'); } catch(e) { closetItems = []; }
    try { wearHistory = JSON.parse(sessionStorage.getItem('guest_history') || '[]'); } catch(e) { wearHistory = []; }
    closetItems.sort((a, b) => (b.createdAt||0) - (a.createdAt||0));
    isDataLoaded = true;
    loadUserPrefs();
    fetchWeather();
    loadSchedulesIntoEvents();
    generateWeeklyOutfitsFromCloset();
    navigate('home');
};
const _btnSkip = document.getElementById('btn-skip-login');
if (_btnSkip) _btnSkip.addEventListener('click', () => window.skipLogin());

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
        const styleTxt = outfit.tags.join('・'); // 季節は含めない（スタイルのみ）
        if (ev) {
            const es = getEventStyle(ev);
            outfit.reason = es
                ? `📅 予定「${ev}」に合わせた${es.label}コーデ。気温(${outfit.temp})も考慮しています。`
                : (styleTxt
                    ? `📅 予定「${ev}」と気温(${outfit.temp})に合わせて、${styleTxt}なコーデを提案します！`
                    : `📅 予定「${ev}」と気温(${outfit.temp})に合わせたコーデを提案します！`);
        } else {
            outfit.reason = styleTxt
                ? `気温(${outfit.temp})に最適な${styleTxt}なコーデを選びました！`
                : `気温(${outfit.temp})に合わせたコーデを選びました！`;
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

        // WMO天気コード → 表示。80-82は「雨（しゅう雨）」、95-99は「雷雨」。雪は71-77/85-86のみ。
        // （以前は code>=71 をすべて「雪」にしていたため、夏のしゅう雨・雷雨が「雪」と出る季節外れバグがあった）
        const parseWeather = (code) => {
            if (code == null || isNaN(code)) return { c: "—", i: "cloud" };
            if (code === 0) return { c: "快晴", i: "sun" };
            if (code <= 3)  return { c: "曇り",   i: "cloud" };          // 1-3
            if (code <= 48) return { c: "霧",     i: "cloud-fog" };      // 45,48
            if (code <= 57) return { c: "霧雨",   i: "cloud-drizzle" };  // 51-57
            if (code <= 67) return { c: "雨",     i: "cloud-rain" };     // 61-67
            if (code <= 77) return { c: "雪",     i: "snowflake" };      // 71-77（降雪）
            if (code <= 82) return { c: "雨",     i: "cloud-rain" };     // 80-82（しゅう雨）
            if (code <= 86) return { c: "雪",     i: "snowflake" };      // 85-86（雪しゅう雨）
            if (code <= 99) return { c: "雷雨",   i: "cloud-lightning" };// 95-99（雷雨）
            return { c: "晴れ", i: "sun" };
        };

        if (data.daily) {
            weeklyOutfits.forEach((outfit, index) => {
                if (index < data.daily.time.length) {
                    const w = parseWeather(data.daily.weathercode[index]);
                    const tmax = data.daily.temperature_2m_max[index];
                    outfit.temp = (tmax == null || isNaN(tmax)) ? '--°C' : `${Math.round(tmax)}°C`;
                    outfit.condition = w.c;
                    outfit.icon = w.i;
                }
            });
            // 今日（index 0）は「現在の天気」で上書き＝ホームの“いま”の気温・天気を正確に表示
            if (data.current_weather && weeklyOutfits[0]) {
                const cw = parseWeather(data.current_weather.weathercode);
                const ct = data.current_weather.temperature;
                if (ct != null && !isNaN(ct)) weeklyOutfits[0].temp = `${Math.round(ct)}°C`;
                weeklyOutfits[0].condition = cw.c;
                weeklyOutfits[0].icon = cw.i;
            }
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
// 傾向分析の「切り口」。1つのボタン→メニューから選ぶ（スタイル/色/カテゴリ/季節/対象）。常に多い順で表示。
const CHART_DIMS = {
    styles:   { label: 'スタイル', get: i => i.styles },
    colors:   { label: '色',       get: i => i.colors },
    category: { label: 'カテゴリ',  get: i => (i.category ? [i.category] : []) },
    subCategory: { label: '種類',   get: i => (i.subCategory ? [i.subCategory] : []) },
    seasons:  { label: '季節',     get: i => i.seasons },
    gender:   { label: '対象',     get: i => (i.gender ? [i.gender] : []) },
};
let chartDimension = 'styles';

function countByDimension(dim) {
    const cfg = CHART_DIMS[dim] || CHART_DIMS.styles;
    const counts = {};
    closetItems.forEach(item => {
        (cfg.get(item) || []).forEach(v => { if (v) counts[v] = (counts[v] || 0) + 1; });
    });
    return counts;
}

function initStyleChart() {
    const canvas = document.getElementById('style-chart');
    if (!canvas) return;

    if (styleChartInstance) { styleChartInstance.destroy(); styleChartInstance = null; }

    const counts = countByDimension(chartDimension);
    const empty = Object.keys(counts).length === 0;
    const msgEl = document.getElementById('chart-empty-msg');
    if (msgEl) msgEl.style.display = empty ? 'block' : 'none';
    canvas.style.display = empty ? 'none' : 'block';
    if (empty) return;

    // 常に多い順（降順）で表示する
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(e => e[0]);
    const dataVals = sorted.map(e => e[1]);

    // 「色」切り口のときは実際の色で塗る。白・ベージュ・黄など淡い色は淵を濃くして見やすくする。
    const COLOR_HEX = { '赤':'#ef4444','青':'#3b82f6','黄':'#eab308','緑':'#22c55e','むらさき':'#8b5cf6','ピンク':'#ec4899','オレンジ':'#f97316','ベージュ':'#e7d8b8','グレー':'#9ca3af','黒':'#111827','白':'#ffffff' };
    const isColorDim = (chartDimension === 'colors');
    const bgColors = labels.map((l, i) => isColorDim ? (COLOR_HEX[l] || CHART_COLORS[i % CHART_COLORS.length]) : CHART_COLORS[i % CHART_COLORS.length]);
    const borderColors = bgColors.map(() => '#111827'); // 全セグメントの淵を黒にして見やすく

    styleChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: dataVals,
                backgroundColor: bgColors,
                borderWidth: 2,
                borderColor: borderColors
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

// 切り口ボタンのラベルを現在の切り口に更新
function updateChartSortBtn() {
    const b = document.getElementById('chart-sort-btn');
    if (b) b.innerHTML = `📊 ${CHART_DIMS[chartDimension].label} <span style="font-size:0.7rem;">▾</span>`;
}
// 並び替えメニュー（タブ）の開閉
window.toggleChartMenu = function() {
    const m = document.getElementById('chart-menu');
    if (m) m.style.display = (!m.style.display || m.style.display === 'none') ? 'block' : 'none';
};
function closeChartMenu() {
    const m = document.getElementById('chart-menu');
    if (m) m.style.display = 'none';
}
// 切り口を選んだとき：グラフを切り替えてメニュー（タブ）を閉じる
window.setChartDimension = function(dim) {
    if (!CHART_DIMS[dim]) return;
    chartDimension = dim;
    closeChartMenu();
    updateChartSortBtn();
    initStyleChart();
};

// =============================================
// 週間コーデ生成（所持服優先・前日被り防止・履歴反映）
// =============================================
// コーデ提案ルール（ログイン=localStorage / ゲスト=sessionStorageに保存。アウター必須判定に使用）
function getCoordRules() {
    try {
        return Object.assign({ outerCold: true, outerTemp: 15, outerRain: true },
            JSON.parse(userStore().getItem('coord_rules') || '{}'));
    } catch {
        return { outerCold: true, outerTemp: 15, outerRain: true };
    }
}

window.setOuterRule = function(key, value) {
    const rules = getCoordRules();
    rules[key] = value;
    userStore().setItem('coord_rules', JSON.stringify(rules));
    if (isDataLoaded && (closetItems.length || wearHistory.length)) generateWeeklyOutfitsFromCloset();
    navigate('settings');
};

// 寒い日・雨雪の日にアウターが必要か判定
function needsOuter(outfit, rules) {
    const cond = outfit.condition || '';
    if (rules.outerRain && (cond.includes('雨') || cond === '雪')) return true;
    const temp = parseInt(outfit.temp);
    if (rules.outerCold && outfit.temp !== '--°C' && !isNaN(temp) && temp <= rules.outerTemp) return true;
    return false;
}

// 予測が出せない初回ユーザー向け：楽天の人気アイテムで「こんなコーデが出ます」サンプルを2つ表示
async function loadSampleCoords() {
    const el = document.getElementById('sample-coords');
    if (!el) return;
    try {
        const mo = new Date().getMonth() + 1;
        const season = (mo >= 3 && mo <= 5) ? '春' : (mo >= 6 && mo <= 8) ? '夏' : (mo >= 9 && mo <= 11) ? '秋' : '冬';
        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rakutenSearch: { keyword: `${season} コーディネート`, hits: 6, sort: '-reviewCount' } })
        });
        const data = await res.json();
        const items = (data.Items || []).map(x => x.Item).filter(Boolean).slice(0, 2);
        const cur = document.getElementById('sample-coords');
        if (!cur) return;
        if (items.length === 0) { cur.style.display = 'none'; return; }
        const card = (it) => {
            const img = (it.mediumImageUrls && it.mediumImageUrls[0] && it.mediumImageUrls[0].imageUrl) ||
                        (it.smallImageUrls && it.smallImageUrls[0] && it.smallImageUrls[0].imageUrl) || '';
            return `<a href="${it.itemUrl || '#'}" target="_blank" rel="noopener" class="card" style="margin-bottom:0; overflow:hidden; padding:0; display:block; text-decoration:none; color:inherit;">
                <div style="position:relative;">
                    <img src="${img}" onerror="this.onerror=null;this.removeAttribute('src');this.style.background='var(--primary-light)';" style="width:100%; height:150px; object-fit:cover; display:block;" alt="サンプル">
                    <span style="position:absolute; top:6px; left:6px; background:var(--accent-color); color:#fff; font-size:0.62rem; padding:2px 8px; border-radius:8px;">📌 サンプル</span>
                </div>
                <p style="font-size:0.72rem; padding:8px; color:var(--text-secondary); line-height:1.4;">${(it.itemName || '').slice(0, 36)}</p>
            </a>`;
        };
        cur.innerHTML = `
            <p style="font-size:0.85rem; font-weight:600; margin:4px 0 8px;">📌 こんなコーデが提案されます（サンプル）</p>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">${items.map(card).join('')}</div>
            <p style="font-size:0.73rem; color:var(--text-secondary); margin-top:8px;">※楽天の人気アイテム。服を登録すると、あなたの手持ちで作った提案に変わります。</p>`;
    } catch (e) {
        const cur = document.getElementById('sample-coords');
        if (cur) cur.style.display = 'none'; // 取得失敗時は静かに隠す
    }
}

// 1週間のコーデ予測を出せる条件：
//  (上半身[トップス or アウター]≥1 かつ ボトムス≥1 ＝合計2着で1コーデ成立) または ワンピース≥2 または スーツ≥2
function canPredictOutfits() {
    let tops = 0, bottoms = 0, onepiece = 0, suit = 0;
    closetItems.forEach(i => {
        if (i.category === 'トップス' || i.category === 'トップス・アウター' || i.category === 'アウター') tops++;
        else if (i.category === 'ボトムス') bottoms++;
        else if (i.category === 'ワンピース' || i.category === 'ドレス') onepiece++;
        else if (i.category === 'スーツ') suit++;
    });
    return (tops >= 1 && bottoms >= 1) || onepiece >= 2 || suit >= 2;
}

function generateWeeklyOutfitsFromCloset() {
    // 予測を出せる構成（上下2着ずつ等）でないときは提案を生成しない。画像系をクリアして案内文だけ残す。
    if (!canPredictOutfits()) {
        weeklyOutfits.forEach(o => {
            o.image = null; o.topsImage = null; o.bottomsImage = null;
            o.outerImage = null; o.outerName = null;
            o.isFromHistory = false; o.tags = [];
            o.reason = 'トップスとボトムスを2着ずつ（またはワンピース/スーツを2着）登録すると、コーデが提案されます。';
        });
        return;
    }

    // 「トップス・アウター」は旧データ。トップス扱いで後方互換を保つ。スーツはワンピース同様の「一着で完成」枠に含める
    const tops      = closetItems.filter(i => i.category === 'トップス' || i.category === 'トップス・アウター' || i.category === 'アウター');
    const bottoms   = closetItems.filter(i => i.category === 'ボトムス');
    const onepieces = closetItems.filter(i => i.category === 'ワンピース' || i.category === 'ドレス' || i.category === 'スーツ');
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
                        ['トップス', 'トップス・アウター', 'アウター', 'ワンピース', 'ドレス', 'スーツ'].includes(it.category));
                    const bottomsItem = h.items.find(it => it.category === 'ボトムス');
                    topsImage    = topsItem ? topsItem.image : null;
                    bottomsImage = bottomsItem ? bottomsItem.image : null;
                    // 上半身が特定できない時だけ、ボトムスと重複しない先頭画像で補完（同じボトムスが2枚出るバグ対策）
                    if (!topsImage) topsImage = display.images.find(img => img !== bottomsImage) || null;
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
            outfit.tags  = [...new Set(
                (op.styles || []).map(s => s.replace('系', ''))
            )].slice(0, 3); // 季節は季節外れに見えるのでタグに含めない
            outfit.reason = `${weather ? weather + 'に合わせた' : ''}あなたの「${op.subCategory || op.category || 'ワンピース'}」コーデです。`;
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
            outfit.tags = styleTags; // 季節は含めない（季節外れ表示を防ぐ）
            outfit.reason = b
                ? `${weather ? weather + 'に合わせた' : ''}あなたの「${t.subCategory || t.category}」×「${b.subCategory || b.category}」コーデです。`
                : `${weather ? weather + 'に合わせた' : ''}あなたの「${t.subCategory || t.category}」を使ったコーデです。`;
            prevTopsId    = t.id;
            prevBottomsId = b ? b.id : prevBottomsId;
        }

        // 提案ルール：寒い日・雨雪の日はアウターをセット提案
        if (needsOuter(outfit, coordRules) && outers.length > 0) {
            // 上半身に選んだアウターを重ね着レイヤーに再利用しない
            let outerPool = prefer(outers).filter(o => o.id !== prevTopsId);
            if (outerPool.length === 0) outerPool = prefer(outers);
            const o = outerPool[Math.floor(Math.random() * outerPool.length)];
            if (o) {
                outfit.outerImage = o.image;
                outfit.outerName  = o.subCategory || 'アウター';
                const why = ((outfit.condition || '').includes('雨') || outfit.condition === '雪') ? '雨で冷えるので' : '冷えるので';
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
// クローゼットで一番多い「対象」タグを返す（メンズ/レディース。同数や無しは ''＝中立）
function getDominantGender() {
    const counts = { 'メンズ': 0, 'レディース': 0 };
    closetItems.forEach(it => { if (it.gender === 'メンズ' || it.gender === 'レディース') counts[it.gender]++; });
    if (counts['メンズ'] === 0 && counts['レディース'] === 0) return '';
    if (counts['メンズ'] === counts['レディース']) return '';
    return counts['メンズ'] > counts['レディース'] ? 'メンズ' : 'レディース';
}

// ===== 多店舗の検索リンク（買い足しおすすめ用） =====
// どんな入力・障害でもリンクが壊れない設計（最悪でもGoogleサイト内検索に退避）。
function googleSiteSearch(domain, kw) {
    return 'https://www.google.com/search?q=' + encodeURIComponent((kw || '') + ' site:' + domain);
}
// ZOZOTOWNのWeb検索キーワードはShift_JIS指定。encoding.jsがあれば直リンク、無ければGoogle検索に退避。
function zozoSearchURL(kw) {
    try {
        if (window.Encoding && Encoding.convert && Encoding.stringToCode) {
            const sjis = Encoding.convert(Encoding.stringToCode(kw), { to: 'SJIS', from: 'UNICODE', type: 'array' });
            // 63 = '?' = Shift_JISに変換できない文字が混入した印。混入時は直リンクを使わない。
            if (sjis && sjis.length && sjis.indexOf(63) === -1) {
                const pct = sjis.map(b => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
                return 'https://zozo.jp/search/?p_keyv=' + pct;
            }
        }
    } catch (e) { /* 変換失敗時は下のフォールバックへ */ }
    return googleSiteSearch('zozo.jp', kw);
}
// 店ごとの正しい検索URLを返す（形式が確実な店は直リンク、不確実な店はGoogle検索）。
function storeSearchURL(store, kw) {
    kw = (kw || '').trim();
    if (!kw) return null;                                  // 空キーワードはリンクを作らない
    try {
        const u = encodeURIComponent(kw);                  // UTF-8（楽天/ユニクロ/GU/LOCONDO）
        switch (store) {
            case 'rakuten': return 'https://search.rakuten.co.jp/search/mall/' + u + '/';
            case 'uniqlo':  return 'https://www.uniqlo.com/jp/ja/search?q=' + u;
            case 'gu':      return 'https://www.gu-global.com/jp/ja/search?q=' + u;
            case 'locondo': return 'https://www.locondo.jp/shop/search?searchWord=' + u;
            case 'abcmart': return googleSiteSearch('abc-mart.net', kw); // 検索仕様非公開→安全側
            case 'zozo':    return zozoSearchURL(kw);
            default:        return null;
        }
    } catch (e) {
        return googleSiteSearch('rakuten.co.jp', kw);      // 想定外でも壊さない
    }
}
const STORE_LABELS = { rakuten: '楽天', uniqlo: 'ユニクロ', gu: 'GU', zozo: 'ZOZOTOWN', locondo: 'LOCONDO', abcmart: 'ABC-MART' };
// 提案カテゴリに合う店の並び（靴は靴専門店、それ以外は服・総合店）。
function storesForCategory(cat) {
    if (cat === '靴' || cat === 'シューズ') return ['locondo', 'rakuten', 'zozo', 'abcmart'];
    return ['rakuten', 'uniqlo', 'gu', 'zozo']; // トップス/アウター/ボトムス/帽子/ワンピース/ドレス/スーツ/小物
}
// 1提案ぶんの「他のお店で探す」ボタン群HTML（カテゴリ別）。
function buildStoreLinksHTML(rec) {
    const kw = (rec && (rec.keyword || rec.item)) || '';
    if (!kw.trim()) return '';
    const stores = storesForCategory(rec && rec.category);
    const btns = stores.map(s => {
        const url = storeSearchURL(s, kw);
        if (!url) return '';
        return `<a href="${url}" target="_blank" rel="noopener" style="display:flex; align-items:center; justify-content:space-between; gap:4px; padding:7px 10px; border:1px solid rgba(0,0,0,0.12); border-radius:8px; text-decoration:none; color:inherit; font-size:0.78rem;">${STORE_LABELS[s] || s}<i data-lucide="external-link" style="width:13px; height:13px; opacity:.5;"></i></a>`;
    }).filter(Boolean).join('');
    if (!btns) return '';
    return `<div style="margin-top:10px;">
        <p style="font-size:0.72rem; color:var(--text-secondary); margin-bottom:6px;">他のお店で「${rec.item || ''}」を探す</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">${btns}</div>
    </div>`;
}

// AI結果のキャッシュ（無料枠の節約・再呼び出し防止）。クローゼットやコーデが変わるとキー不一致で自然に作り直す。
let recommendCache = null, recommendCacheKey = '';
const stylingTipsCache = new Map();

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
    const gender = getDominantGender(); // メンズ / レディース / ''（中立）

    // Geminiに「買い足すと着回しが広がるアイテム」を提案させる（JSON）
    const prompt = `あなたはプロのスタイリストです。次の人のクローゼットを分析し、「今は持っていないが、買い足すと手持ちの服との着回しが広がるアイテム」を3点提案してください。
【カテゴリ別の点数】${catStr}
【スタイルの傾向】${styleStr}
【色の傾向】${colorStr}
${gender ? `【対象】このユーザーは${gender}の服が中心なので、${gender}向けのアイテムを提案すること。` : ''}

ルール:
- 手持ちに不足・手薄なカテゴリや色を補い、着回しが広がる物を選ぶ。
- 各提案に、手持ちとの組み合わせ理由を一言添える。
- keyword は通販サイトで検索する用の簡潔な日本語（${gender ? `必ず「${gender}」を含める。例「${gender} 白シャツ」` : '例「白 シャツ」'}）。
- category は次のいずれか1つだけ: トップス / アウター / ボトムス / 帽子 / 靴 / ワンピース / ドレス / スーツ / 小物。
- JSONのみで返す。
形式: {"recommends":[{"item":"アイテム名","reason":"理由(1文)","keyword":"検索キーワード","category":"カテゴリ"}]}`;

    const recKey = `${catStr}|${styleStr}|${colorStr}|${gender}`;
    const fromCache = !!(recommendCache && recommendCacheKey === recKey);
    let recs = fromCache ? recommendCache : [];
    if (!fromCache) {
        try {
            const r = JSON.parse(await callGemini(prompt, null, { json: true }));
            recs = (r.recommends || []).slice(0, 3);
        } catch (e) { recs = []; }
    }

    // 各提案について楽天で実商品を取得（1件ずつ）※キャッシュ再利用時はスキップ
    if (!fromCache) {
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
        if (recs.length) { recommendCache = recs; recommendCacheKey = recKey; }
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
            html += buildStoreLinksHTML(rec);
            html += `</div>`;
        });
        html += `<p style="font-size:0.7rem; color:var(--text-secondary);">※上段は楽天市場の実商品（アフィリエイト）。下段はカテゴリに合うお店の検索リンクです。</p>`;
    }
    html += `<button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button></div>`;

    modalContainer.innerHTML = html;
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

// ★お気に入りだけでコーデを提案（ローカルで組み合わせ・AI不要・即表示）。既存機能は変更しない“追加”。
window.showFavoriteCoords = function() {
    const favs = closetItems.filter(i => i.favorite);
    const isTop = c => c === 'トップス' || c === 'アウター' || c === 'トップス・アウター';
    const tops = favs.filter(i => isTop(i.category));
    const bottoms = favs.filter(i => i.category === 'ボトムス');
    const onepieces = favs.filter(i => ['ワンピース', 'ドレス', 'スーツ'].includes(i.category));
    const accessories = favs.filter(i => ['小物', '帽子', '靴'].includes(i.category));

    const openModal = (inner) => {
        modalContainer.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
                <h3 class="section-title">★ お気に入りコーデ</h3>
                ${inner}
                <button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button>
            </div>`;
        modalContainer.classList.remove('hidden');
        lucide.createIcons();
        document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    };

    if (favs.length === 0) {
        openModal(`<p style="color:var(--text-secondary); font-size:0.9rem;">お気に入りの服がありません。クローゼットで服の右上の☆をタップして、お気に入りに登録してください。</p>`);
        return;
    }

    // 組み合わせ：トップス×ボトムスを最大6件＋ワンピース/スーツ単体
    const combos = [];
    for (const t of tops) {
        for (const b of bottoms) {
            combos.push([t, b]);
            if (combos.length >= 6) break;
        }
        if (combos.length >= 6) break;
    }
    onepieces.forEach(o => combos.push([o]));

    if (combos.length === 0) {
        openModal(`<p style="color:var(--text-secondary); font-size:0.9rem;">コーデを組むには、お気に入りに<strong>トップスとボトムスを1着ずつ</strong>（またはワンピース/スーツ）登録してください。<br>今のお気に入り：${favs.length}点</p>`);
        return;
    }

    const accHint = accessories.length
        ? `<p style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">＋ お気に入りの小物・靴・帽子（${accessories.map(a => a.subCategory || a.category).join('・')}）を合わせても◎</p>`
        : '';

    const combosHtml = combos.map((c, idx) => {
        const imgs = c.map(it => `
            <div style="text-align:center;">
                <img src="${it.image}" style="width:84px; height:84px; object-fit:cover; border-radius:10px;" alt="">
                <p style="font-size:0.7rem; margin-top:3px; color:var(--text-secondary);">${it.subCategory || it.category}</p>
            </div>`).join('<span style="align-self:center; font-size:1.2rem; color:var(--text-secondary);">＋</span>');
        return `<div style="border:1px solid rgba(0,0,0,0.08); border-radius:12px; padding:12px; margin-bottom:12px;">
            <p style="font-weight:bold; font-size:0.85rem; margin-bottom:8px;">コーデ ${idx + 1}</p>
            <div style="display:flex; gap:8px; justify-content:center; align-items:stretch;">${imgs}</div>
        </div>`;
    }).join('');

    openModal(`
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px;">お気に入り(${favs.length}点)だけで組んだコーデ案です。</p>
        ${combosHtml}
        ${accHint}
    `);
};

// ★お気に入りに似た/相性の良い買い足しを提案（AI＋楽天＋多店舗リンク）。既存の showRecommendItems とは別関数で“追加”。
let favRecommendCache = null, favRecommendCacheKey = '';
window.showFavoriteRecommend = async function() {
    const favs = closetItems.filter(i => i.favorite);
    const openInfo = (inner) => {
        modalContainer.innerHTML = `
            <div class="modal-overlay"></div>
            <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
                <h3 class="section-title">★ お気に入りに似た買い足し</h3>
                ${inner}
                <button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button>
            </div>`;
        modalContainer.classList.remove('hidden');
        lucide.createIcons();
        document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    };
    if (favs.length === 0) {
        openInfo(`<p style="color:var(--text-secondary); font-size:0.9rem;">お気に入りの服がありません。クローゼットで服の右上の☆をタップして登録すると、それに似た・相性の良い服を提案します。</p>`);
        return;
    }

    // ローディング
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content text-center">
            <i data-lucide="loader" class="spinner" style="width:32px; height:32px; color:var(--primary-color); display:block; margin:0 auto 12px;"></i>
            <p style="font-weight:600;">お気に入りを分析中...</p>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);

    const favDesc = favs.map(i => `${i.subCategory || i.category}(${(i.colors || []).join('・') || '色指定なし'}${(i.styles || []).length ? '／' + i.styles.join('・') : ''})`).join('、');
    const gender = getDominantGender();
    const favKey = favDesc + '|' + gender;

    const prompt = `あなたはプロのスタイリストです。次は、ある人が「お気に入り」に登録した服の一覧です。
【お気に入りの服】${favDesc}
${gender ? `【対象】${gender}向けのアイテムにすること。` : ''}
これらの「お気に入りに似た雰囲気」または「お気に入りと相性が良く着回しが広がる」アイテムで、まだ持っていなさそうな服を3点提案してください。
ルール:
- お気に入りの色・スタイル・テイストを踏まえる。
- 各提案に、お気に入りとの関係（似ている／相性が良い理由）を一言添える。
- keyword は通販サイトで検索する用の簡潔な日本語（${gender ? `必ず「${gender}」を含める。` : ''}）。
- category は次のいずれか1つだけ: トップス / アウター / ボトムス / 帽子 / 靴 / ワンピース / ドレス / スーツ / 小物。
- JSONのみで返す。
形式: {"recommends":[{"item":"アイテム名","reason":"理由(1文)","keyword":"検索キーワード","category":"カテゴリ"}]}`;

    const fromCache = !!(favRecommendCache && favRecommendCacheKey === favKey);
    let recs = fromCache ? favRecommendCache : [];
    if (!fromCache) {
        try {
            const r = JSON.parse(await callGemini(prompt, null, { json: true }));
            recs = (r.recommends || []).slice(0, 3);
        } catch (e) { recs = []; }
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
        if (recs.length) { favRecommendCache = recs; favRecommendCacheKey = favKey; }
    }

    let html = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
            <h3 class="section-title">★ お気に入りに似た買い足し</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">お気に入り(${favs.length}点)に似た・相性の良いアイテムを提案します。</p>`;
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
            html += buildStoreLinksHTML(rec);
            html += `</div>`;
        });
        html += `<p style="font-size:0.7rem; color:var(--text-secondary);">※上段は楽天の実商品、下段はカテゴリに合うお店の検索リンクです。</p>`;
    }
    html += `<button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button></div>`;
    modalContainer.innerHTML = html;
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

// ===== マネキン試着（VTON・評価版）。自撮りに服を着せ替え。HF無料エンジンを別Worker経由で使用 =====
let vtonState = { selfie: null, garment: null };
let vtonCache = {};
let vtonBusy = false;

window.openVtonModal = function() { renderVtonModal(); };

function renderVtonModal(resultImg) {
    const configured = !VTON_WORKER_URL.includes('REPLACE-WITH');
    const g = vtonState.garment;
    const selfieBox = vtonState.selfie
        ? `<img src="${vtonState.selfie}" style="width:120px; height:150px; object-fit:cover; border-radius:12px;">`
        : `<div style="width:120px; height:150px; border:2px dashed var(--primary-color); border-radius:12px; display:flex; align-items:center; justify-content:center; color:var(--primary-color); font-size:0.8rem; text-align:center;">自撮りを<br>入れる</div>`;
    const garmentBox = g
        ? `<img src="${g.image}" style="width:120px; height:150px; object-fit:cover; border-radius:12px;">`
        : `<div style="width:120px; height:150px; border:2px dashed var(--accent-color); border-radius:12px; display:flex; align-items:center; justify-content:center; color:var(--accent-color); font-size:0.8rem; text-align:center;">着せる服を<br>選ぶ</div>`;
    const canRun = vtonState.selfie && vtonState.garment && configured && !vtonBusy;
    const resultHtml = resultImg
        ? `<div style="margin-top:14px; text-align:center;"><p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">試着イメージ（評価版・ラフ）</p><img src="${resultImg}" style="width:100%; max-width:280px; border-radius:12px;"></div>`
        : '';
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:88vh; overflow-y:auto;">
            <h3 class="section-title">🧍 マネキン試着（β・評価版）</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:14px; line-height:1.6;">自分の自撮り写真に、選んだ服を着せ替えて見え方を試します。${configured ? '' : '<br><strong>※このエンジンは現在準備中です（VTON Worker を設定すると使えます）。</strong>'}</p>
            <div style="display:flex; gap:12px; justify-content:center; align-items:flex-start;">
                <div style="text-align:center;">
                    ${selfieBox}
                    <button onclick="document.getElementById('vton-selfie-input').click()" style="display:block; margin:8px auto 0; background:var(--surface-solid); color:var(--primary-color); border:2px solid var(--primary-color); border-radius:10px; padding:6px 10px; font-size:0.75rem; cursor:pointer;">📷 自撮り</button>
                </div>
                <div style="align-self:center; font-size:1.4rem; color:var(--text-secondary);">＋</div>
                <div style="text-align:center;">
                    ${garmentBox}
                    <button onclick="openVtonGarmentPicker()" style="display:block; margin:8px auto 0; background:var(--surface-solid); color:var(--accent-color); border:2px solid var(--accent-color); border-radius:10px; padding:6px 10px; font-size:0.75rem; cursor:pointer;">👕 服を選ぶ</button>
                </div>
            </div>
            <input type="file" id="vton-selfie-input" accept="image/*" capture="user" class="hidden" onchange="onVtonSelfie(this)">
            <button onclick="runVton()" ${canRun ? '' : 'disabled'} style="width:100%; background:${canRun ? 'var(--primary-color)' : '#cbd5e1'}; color:#fff; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:${canRun ? 'pointer' : 'not-allowed'}; margin-top:14px;">
                ${vtonBusy ? '生成中…（30秒ほどかかることがあります）' : '👗 試着する（生成）'}
            </button>
            ${resultHtml}
            <p style="font-size:0.7rem; color:var(--text-secondary); margin-top:12px; line-height:1.6;">※無料エンジンのため、混雑時は待つ／失敗することがあります（評価用）。うまくいかない時は少し待って再試行してください。</p>
            <button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
}

window.onVtonSelfie = function(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => { vtonState.selfie = await compressImage(ev.target.result); renderVtonModal(); };
    reader.readAsDataURL(file);
};

window.openVtonGarmentPicker = function() {
    const items = closetItems;
    const grid = items.length === 0
        ? '<p style="color:var(--text-secondary); font-size:0.85rem; text-align:center; padding:20px;">クローゼットに服がありません。先に服を登録してください。</p>'
        : `<div class="closet-grid">${items.map(it => `<div class="closet-item" onclick="pickVtonGarment('${it.id}')" style="cursor:pointer;"><img src="${it.image}" alt=""><div class="item-tags"><span class="tag-small">${it.subCategory || it.category}</span></div></div>`).join('')}</div>`;
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:88vh; overflow-y:auto;">
            <h3 class="section-title">着せる服を選ぶ</h3>
            <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:10px;">1着タップで選ぶ→試着画面に戻ります。</p>
            ${grid}
            <button onclick="openVtonModal()" class="btn-outline text-center mt-4">戻る</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', () => openVtonModal());
};
window.pickVtonGarment = function(id) {
    vtonState.garment = closetItems.find(i => i.id === id) || null;
    renderVtonModal();
};

// VTON生成（別Worker経由）。安全策：連打防止(vtonBusy)・キャッシュ・失敗表示。
window.runVton = async function() {
    if (vtonBusy || !vtonState.selfie || !vtonState.garment) return;
    if (VTON_WORKER_URL.includes('REPLACE-WITH')) { alert('試着エンジンが未設定です（準備中）。'); return; }
    const cacheKey = vtonState.garment.id + '|' + vtonState.selfie.length;
    if (vtonCache[cacheKey]) { renderVtonModal(vtonCache[cacheKey]); return; }
    vtonBusy = true; renderVtonModal();
    try {
        const res = await fetch(VTON_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ person: vtonState.selfie, garment: vtonState.garment.image })
        });
        const data = await res.json().catch(() => ({}));
        vtonBusy = false;
        if (res.ok && data.image) { vtonCache[cacheKey] = data.image; renderVtonModal(data.image); }
        else { renderVtonModal(); alert((data.error && (data.error.message || data.error)) || '試着の生成に失敗しました。混雑時は少し待って再試行してください。'); }
    } catch (e) {
        vtonBusy = false; renderVtonModal();
        alert('通信に失敗しました。時間をおいて再度お試しください。');
    }
};

// お店を探す：現在地の近くで指定キーワードをGoogleマップ検索（無料・APIキー不要）
window.openMapSearch = function(keyword) {
    let q = keyword;
    if (!q) {
        const input = document.getElementById('map-search-input');
        q = input ? input.value.trim() : '';
    }
    if (!q) return;
    let url;
    if (userLocation && userLocation.lat && userLocation.lon) {
        // 現在地周辺で検索（地図を現在地中心に）
        url = `https://www.google.com/maps/search/${encodeURIComponent(q)}/@${userLocation.lat},${userLocation.lon},14z`;
    } else {
        // 現在地なし → 端末の位置に任せて検索
        url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
    }
    window.open(url, '_blank');
};

// 「お店を探す」モーダル
window.openMapModal = function() {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">🗺 お店を探す</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:10px;">近くのお店をGoogleマップで探します。${userLocation ? `（現在地：${userLocation.name}周辺）` : '（設定で現在地をオンにすると精度が上がります）'}</p>
            <div class="quick-prompts">
                <button class="quick-prompt-btn" onclick="openMapSearch('古着屋')">古着屋</button>
                <button class="quick-prompt-btn" onclick="openMapSearch('ユニクロ')">ユニクロ</button>
                <button class="quick-prompt-btn" onclick="openMapSearch('GU')">GU</button>
                <button class="quick-prompt-btn" onclick="openMapSearch('セレクトショップ 服')">セレクトショップ</button>
                <button class="quick-prompt-btn" onclick="openMapSearch('無印良品')">無印良品</button>
                <button class="quick-prompt-btn" onclick="openMapSearch('しまむら')">しまむら</button>
            </div>
            <div style="display:flex; gap:8px; margin-top:8px;">
                <input type="text" id="map-search-input" class="input-field" placeholder="例：ヴィンテージ デニム ／ コート 古着" style="flex:1; padding:10px 12px;" onkeydown="if(event.key==='Enter') openMapSearch()">
                <button onclick="openMapSearch()" style="background:var(--primary-color); color:white; border:none; padding:10px 14px; border-radius:var(--border-radius-md); cursor:pointer; flex-shrink:0;">
                    <i data-lucide="map-pin" style="width:18px; height:18px;"></i>
                </button>
            </div>
            <button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

// 「コーデ検証ルーム」モーダル（選択・分析もこのモーダル内で完結）
window.openCoordRoomModal = function() {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:85vh; overflow-y:auto;">
            <h3 class="section-title">コーデ検証ルーム</h3>
            <div id="coord-room">
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">手持ちの服を組み合わせてAIの評価を聞いてみよう！</p>
                ${renderCoordRoom()}
            </div>
            <button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

// 「AIスタイリスト相談」モーダル
window.openChatModal = function() {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:85vh; overflow-y:auto;">
            <h3 class="section-title">💬 AIスタイリストに相談</h3>
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
            <button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    const chatEl = document.getElementById('chat-messages');
    if (chatEl) renderChatMessages(chatEl);
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
    const gender = getDominantGender(); // メンズ / レディース / ''（中立）

    // 1) 楽天で「今季の人気ファッション」を取得（＝トレンド傾向。対象タグが多い方に寄せる）
    let trendItems = [];
    try {
        const res = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rakutenSearch: { keyword: `${gender ? gender + ' ' : ''}${season} ファッション トレンド`, hits: 8, sort: '-reviewCount' } })
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
        headerAction: `<button onclick="openGuideModal()" title="使い方ガイド" style="background:none; border:none; color:var(--primary-color); cursor:pointer; display:flex; align-items:center;"><i data-lucide="help-circle" style="width:24px; height:24px;"></i></button>`,
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
            `;

            // 1週間のコーデ予測：(トップス≥2かつボトムス≥2) または ワンピース≥2 または スーツ≥2 のときだけ表示。
            // 条件を満たさないときはセクションごと出さない（機能は削除せず条件付き非表示）。
            if (canPredictOutfits()) {
            html += `<h3 class="section-title">1週間のコーデ予測</h3>
            <div class="carousel-container">
            `;

            weeklyOutfits.forEach((outfit, index) => {
                // トップス＋ボトムスを横並び表示
                // 画像が読み込めない（削除済み等）ときは崩れアイコンを出さず、灰色のプレースホルダーに差し替える
                const onErr = "this.onerror=null;this.removeAttribute('src');this.style.background='var(--primary-light)';";
                let thumbHtml;
                if (outfit.topsImage && outfit.bottomsImage) {
                    thumbHtml = `<div style="display:flex; gap:2px; height:200px; overflow:hidden;">
                           <img src="${outfit.topsImage}" alt="tops" onerror="${onErr}" style="flex:1; object-fit:cover; min-width:0;">
                           <img src="${outfit.bottomsImage}" alt="bottoms" onerror="${onErr}" style="flex:1; object-fit:cover; min-width:0;">
                       </div>`;
                } else if (outfit.topsImage || outfit.image) {
                    thumbHtml = `<img src="${outfit.topsImage || outfit.image}" alt="Outfit" class="outfit-image" onerror="${onErr}" style="height:200px;" />`;
                } else {
                    // 画像なし → 崩れた画像ではなく中立のプレースホルダー
                    thumbHtml = `<div class="outfit-image" style="height:200px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; background:var(--primary-light); color:var(--text-secondary); font-size:0.8rem; text-align:center; padding:12px;"><i data-lucide="shirt" style="width:30px; height:30px; opacity:0.6;"></i>コーデ画像なし</div>`;
                }

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
                            <p class="mt-4" style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.7; word-break: auto-phrase; line-break: strict; overflow-wrap: anywhere;">
                                <i data-lucide="sparkles" class="inline-icon" style="color: var(--accent-color);"></i>
                                ${outfit.reason}
                            </p>
                        </div>
                    </div>
                </div>
                `;
            });

            html += `</div>`;
            } else {
                // 条件未満でも見出し「1週間のコーデ予測」は残し、その下に案内＋表示条件を表示
                html += `<h3 class="section-title">1週間のコーデ予測</h3>
                <div class="card" style="text-align:center; padding:20px; margin-bottom:8px; color:var(--text-secondary); font-size:0.85rem; line-height:1.6;">
                    <i data-lucide="shirt" style="width:28px; height:28px; opacity:0.6; display:block; margin:0 auto 8px;"></i>
                    クローゼットに服の画像を登録すると、ここに毎日のコーデ予測が表示されます。
                    <div style="margin-top:10px; font-size:0.78rem; text-align:left; background:var(--primary-light); border-radius:8px; padding:10px 12px;">
                        <strong>表示される条件（いずれか）</strong><br>
                        ・トップス／アウターを1着以上 ＋ ボトムスを1着以上（合計2着）<br>
                        ・ワンピース2着以上<br>
                        ・スーツ2着以上
                    </div>
                </div>
                <div id="sample-coords" style="margin-bottom:8px;">
                    <p style="font-size:0.82rem; color:var(--text-secondary);"><i data-lucide="loader" class="spinner inline-icon"></i> サンプルコーデを読み込み中...</p>
                </div>`;
            }

            // メニュー：5機能をコンパクトなタイルに。タップでモーダル表示
            const tile = (onclick, icon, label, color) =>
                `<div class="card" onclick="${onclick}" style="cursor:pointer; margin-bottom:0; text-align:center; padding:18px 10px;">
                    <i data-lucide="${icon}" style="width:28px; height:28px; color:${color};"></i>
                    <p style="font-weight:700; margin-top:8px; font-size:0.88rem;">${label}</p>
                </div>`;
            // 準備中の機能：アクセス不可（クリックできない）＋「Coming Soon」表示。実現したらtile()に置き換える。
            const comingSoonTile = (icon, label) =>
                `<div class="card" style="margin-bottom:0; text-align:center; padding:18px 10px; opacity:0.55; cursor:not-allowed; position:relative;" aria-disabled="true">
                    <span style="position:absolute; top:6px; right:6px; background:var(--text-secondary); color:#fff; font-size:0.58rem; padding:2px 6px; border-radius:8px; letter-spacing:0.02em;">Coming Soon</span>
                    <i data-lucide="${icon}" style="width:28px; height:28px; color:var(--text-secondary);"></i>
                    <p style="font-weight:700; margin-top:8px; font-size:0.88rem; color:var(--text-secondary);">${label}</p>
                </div>`;
            html += `
            <h3 class="section-title mt-4">メニュー</h3>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                ${tile("showTrendCoord()",     "trending-up",    "今季のトレンドコーデ", "var(--accent-color)")}
                ${tile("openCoordRoomModal()", "shirt",          "コーデ検証ルーム",     "var(--primary-color)")}
                ${tile("openChatModal()",      "message-circle", "AIスタイリスト相談",   "var(--primary-color)")}
                ${tile("showRecommendItems()", "shopping-bag",   "買い足しおすすめ",     "var(--accent-color)")}
                ${tile("showFavoriteCoords()",   "star",         "お気に入りコーデ",         "#f59e0b")}
                ${tile("showFavoriteRecommend()","sparkles",     "お気に入りに似た買い足し", "#f59e0b")}
                ${tile("openMapModal()",       "map-pin",        "お店を探す",           "var(--primary-color)")}
                ${tile("openVtonModal()",      "user",           "マネキン試着（β）",     "#f59e0b")}
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

            // ファッション傾向分析（1つのボタン→メニューで切り口を選ぶ。選ぶと切り替えてタブを閉じる。常に多い順）
            if (closetItems.length > 0) {
                const menuItem = (onclick, label) =>
                    `<button onclick="${onclick}" style="display:block; width:100%; text-align:left; background:none; border:none; padding:8px 10px; font-size:0.85rem; cursor:pointer; color:var(--text-primary); border-radius:6px;">${label}</button>`;
                const dimItems = Object.entries(CHART_DIMS).map(([key, cfg]) => menuItem(`setChartDimension('${key}')`, cfg.label)).join('');
                const sortLabel = `📊 ${CHART_DIMS[chartDimension].label} <span style="font-size:0.7rem;">▾</span>`;
                html += `
                <div class="card" style="margin-bottom:16px;">
                    <h3 class="section-title">📊 ファッション傾向分析</h3>
                    <div style="position:relative; display:inline-block; margin-bottom:12px;">
                        <button id="chart-sort-btn" onclick="toggleChartMenu()" style="border:1px solid var(--primary-color); border-radius:16px; padding:6px 14px; font-size:0.8rem; cursor:pointer; background:transparent; color:var(--primary-color);">${sortLabel}</button>
                        <div id="chart-menu" class="card" style="display:none; position:absolute; left:50%; transform:translateX(-50%); top:100%; margin-top:4px; z-index:50; min-width:170px; padding:8px; text-align:left;">
                            <div style="font-size:0.68rem; color:var(--text-secondary); padding:2px 10px 4px;">表示の切り口</div>
                            ${dimItems}
                        </div>
                    </div>
                    <div class="chart-container">
                        <canvas id="style-chart"></canvas>
                        <p id="chart-empty-msg" style="display:none; text-align:center; color:var(--text-secondary); font-size:0.85rem; padding:20px;">この切り口のデータがまだありません。</p>
                    </div>
                    <p style="font-size:0.75rem; color:var(--text-secondary); text-align:center; margin-top:8px;">登録中の服 ${closetItems.length}点を集計</p>
                </div>`;
            }

            const filterCount = Object.values(activeFilters).reduce((acc, arr) => acc + arr.length, 0);
            if (filterCount > 0) {
                html += `<p style="font-size:0.8rem; color:var(--primary-color); margin-bottom:12px; font-weight:bold;">${filterCount}つのフィルター適用中</p>`;
            }

            // 保存した画像の表示順を変更（新しい順／古い順／カテゴリ順）
            if (closetItems.length > 0) {
                const sortOpts = [['newest', '新しい順'], ['oldest', '古い順'], ['category', 'カテゴリ順'], ['favorite', '★お気に入り']];
                const sortBtns = sortOpts.map(([key, label]) =>
                    `<button onclick="setClosetSort('${key}')" style="border:1px solid var(--primary-color); border-radius:14px; padding:4px 12px; font-size:0.72rem; cursor:pointer; background:${closetSort === key ? 'var(--primary-color)' : 'transparent'}; color:${closetSort === key ? '#fff' : 'var(--primary-color)'};">${label}</button>`
                ).join('');
                html += `<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:12px;"><span style="font-size:0.72rem; color:var(--text-secondary);">並び替え:</span>${sortBtns}</div>`;
            }

            if (filtered.length === 0) {
                html += `<p class="text-center" style="color: var(--text-secondary); margin-top: 40px;"><i data-lucide="package-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px; display:block; margin:0 auto 16px;"></i><br>衣類が見つかりません。<br>右下の＋ボタンから追加してください。</p>`;
            } else {
                html += `<div class="closet-grid">
                    ${filtered.map(item => {
                        const tags = formatTags(item);
                        return `
                        <div class="closet-item" data-id="${item.id}" onclick="handleClosetItemClick('${item.id}')" style="position:relative;">
                            <img src="${item.image}" alt="clothing">
                            <button id="fav-btn-${item.id}" onclick="event.stopPropagation(); toggleFavorite('${item.id}')" aria-label="お気に入り" style="position:absolute; top:6px; right:6px; width:30px; height:30px; border:none; border-radius:50%; background:rgba(255,255,255,0.9); box-shadow:0 1px 3px rgba(0,0,0,0.2); font-size:16px; line-height:1; padding:0; cursor:pointer; z-index:2; color:${item.favorite ? '#f59e0b' : '#9ca3af'};">${item.favorite ? '★' : '☆'}</button>
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
            // ゲスト（お試しモード）は着用履歴を利用できない旨を案内
            if (isGuest) {
                return `<div class="card" style="text-align:center; padding:28px 20px; color:var(--text-secondary); margin-top:8px;">
                    <i data-lucide="lock" style="width:32px; height:32px; opacity:0.6; display:block; margin:0 auto 10px;"></i>
                    <p style="font-weight:bold; color:var(--text-primary); margin:0 0 6px;">お試しモードでは着用履歴はご利用いただけません</p>
                    <p style="font-size:0.85rem; line-height:1.6; margin:0;">ログイン（登録）すると、着た日を記録してカレンダーで振り返れます。</p>
                </div>`;
            }
            let html = isGuest ? '' : `
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
            <div class="card" onclick="openGuideModal()" style="cursor:pointer; display:flex; align-items:center; gap:10px;">
                <i data-lucide="help-circle" style="width:24px; height:24px; color:var(--primary-color); flex-shrink:0;"></i>
                <div><p style="font-weight:bold; margin:0;">📖 使い方ガイド</p><p style="font-size:0.78rem; color:var(--text-secondary); margin:2px 0 0;">アプリの使い方をいつでも確認できます</p></div>
            </div>

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

            ${isGuest ? `
            <div class="card mt-4" style="text-align:center;">
                <p style="font-weight:bold; margin-bottom:6px;">🧪 お試しモード</p>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">データはこの端末内のみに保存されます（最大${GUEST_MAX_ITEMS}点・他の端末とは同期しません）。<br>クラウド保存・同期するにはログインしてください。</p>
                <button onclick="logout()" style="width:100%; background:var(--primary-color); color:#fff; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer;">ログイン / 新規登録する</button>
            </div>
            ` : `
            <div style="text-align:center; margin-top:32px; padding-bottom:16px;">
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:8px;">ログイン中: ${currentUser ? (currentUser.email || 'Googleアカウント') : ''}</p>
                <button onclick="logout()" style="background:transparent; color:#ef4444; border:1px solid #ef4444; padding:8px 16px; border-radius:20px; font-weight:bold; cursor:pointer;">ログアウト</button>
            </div>`}`;
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
            // 予測が出せない（服が少ない/未登録）時は、楽天の人気アイテムでサンプルコーデを表示
            if (document.getElementById('sample-coords')) loadSampleCoords();
            // 初回のみ：使い方ガイドを自動表示（端末に記録して次回以降は出さない）
            if ((currentUser || isGuest) && localStorage.getItem('guide_seen') !== '1') {
                localStorage.setItem('guide_seen', '1');
                setTimeout(() => openGuideModal(), 500);
            }
        }
    }, 150);
}

// =============================================
// 着用履歴
// =============================================
window.saveToHistory = async function(index) {
    if (!currentUser && !isGuest) return;
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

    if (isGuest) {
        if (!guestSaveConfirm()) return;
        wearHistory.unshift({ id: 'g' + now.getTime(), dateStr, isoDate, occasion: '', items, memo: '', createdAt: now.getTime() });
        saveGuestHistory();
        alert("履歴に保存しました！（お試しモード：閉じるまでこのブラウザ内に保存）");
        return;
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

// コーデ詳細を開いたときに、AIが「着こなしのコツ」を提案する（服に詳しくない人向け）
async function loadStylingTips(outfit) {
    const el = document.getElementById('styling-tips');
    if (!el) return;
    const findByImg = (img) => img ? closetItems.find(i => i.image === img) : null;
    const top = findByImg(outfit.topsImage) || findByImg(outfit.image);
    const bottom = findByImg(outfit.bottomsImage);
    const desc = (it) => it ? `${it.subCategory || it.category}（色:${(it.colors || []).join('・') || '指定なし'}）` : null;
    const parts = [];
    if (desc(top)) parts.push('トップス: ' + desc(top));
    if (desc(bottom)) parts.push('ボトムス: ' + desc(bottom));
    if (outfit.outerName) parts.push('アウター: ' + outfit.outerName);
    const itemsText = parts.join(' / ') || (outfit.tags || []).join('・') || 'このコーデ';
    const prompt = `あなたは親切なファッションスタイリストです。服にあまり詳しくない人向けに、次のコーデを「カッコよく・おしゃれに着こなすコツ」を3つ、具体的に提案してください。
コーデ: ${itemsText}
ルール:
- シャツのイン/アウト、袖まくり、サイズ感、上下のボリュームバランス、小物使いなど、すぐ真似できる具体的なコツにする。
- 専門用語を避け、初心者にも分かる言葉で。各コツは40字以内。
- JSONのみで返す。
形式: {"tips":["コツ1","コツ2","コツ3"]}`;
    const renderTips = (tips) => {
        const cur = document.getElementById('styling-tips'); // 取得中に閉じられた場合に備えて取り直す
        if (!cur) return;
        if (tips && tips.length) {
            cur.innerHTML = `<p style="font-weight:bold; color:var(--text-primary); margin-bottom:8px; font-size:0.9rem;">💡 着こなしのコツ</p>
                <ul style="margin:0; padding-left:18px; font-size:0.84rem; color:var(--text-secondary); line-height:1.7;">
                    ${tips.map(t => `<li>${t}</li>`).join('')}
                </ul>`;
        } else {
            cur.style.display = 'none';
        }
    };
    // 同じコーデは一度取得したら使い回す（再表示でAIを呼ばない＝コスト・混雑対策）
    if (stylingTipsCache.has(itemsText)) { renderTips(stylingTipsCache.get(itemsText)); return; }
    try {
        const parsed = JSON.parse(await callGemini(prompt, null, { json: true }));
        const tips = Array.isArray(parsed.tips) ? parsed.tips.filter(Boolean) : [];
        stylingTipsCache.set(itemsText, tips);
        renderTips(tips);
    } catch (e) {
        const cur = document.getElementById('styling-tips');
        if (cur) cur.innerHTML = `<p style="font-size:0.8rem; color:var(--text-secondary); margin:0;">着こなしのコツを取得できませんでした。AI接続をご確認ください。</p>`;
    }
}

window.openOutfitDetails = function(index) {
    const outfit = weeklyOutfits[index];

    // トップス＋ボトムスの横並び表示（画像が読み込めない場合は灰色プレースホルダーに差し替え）
    const onErrD = "this.onerror=null;this.removeAttribute('src');this.style.background='var(--primary-light)';";
    let imageHtml;
    if (outfit.topsImage && outfit.bottomsImage) {
        imageHtml = `<div style="display:flex; gap:3px; height:240px; border-radius:12px; overflow:hidden; margin-bottom:16px;">
            <img src="${outfit.topsImage}" alt="tops" onerror="${onErrD}" style="flex:1; object-fit:cover; min-width:0;">
            <img src="${outfit.bottomsImage}" alt="bottoms" onerror="${onErrD}" style="flex:1; object-fit:cover; min-width:0;">
        </div>`;
    } else if (outfit.topsImage || outfit.image) {
        imageHtml = `<img src="${outfit.topsImage || outfit.image}" onerror="${onErrD}" style="width:100%; height:240px; object-fit:cover; border-radius:12px; margin-bottom:16px;" alt="outfit">`;
    } else {
        imageHtml = `<div style="width:100%; height:240px; border-radius:12px; margin-bottom:16px; display:flex; align-items:center; justify-content:center; background:var(--primary-light); color:var(--text-secondary); font-size:0.85rem;">服を3着以上登録するとコーデが表示されます</div>`;
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
            <p style="font-size:0.9rem; color:var(--text-secondary); line-height:1.7; margin-bottom:16px; word-break:auto-phrase; line-break:strict; overflow-wrap:anywhere;">
                <i data-lucide="sparkles" class="inline-icon" style="color:var(--accent-color);"></i>
                ${outfit.reason}
            </p>
            ${hatHtml}
            ${accessoryHtml}
            ${(outfit.topsImage || outfit.image) ? `<div id="styling-tips" style="background:var(--primary-light); border:1px solid rgba(14,165,233,0.2); padding:12px; border-radius:10px; margin-bottom:16px;">
                <p style="font-size:0.85rem; color:var(--text-secondary); margin:0;"><i data-lucide="loader" class="spinner inline-icon"></i> 着こなしのコツを考え中...</p>
            </div>` : ''}
            <button onclick="saveToHistory(${index})" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">
                今日着た！履歴に残す
            </button>
            <button onclick="closeModal()" class="btn-outline text-center">閉じる</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    if (outfit.topsImage || outfit.image) loadStylingTips(outfit); // AIで着こなしのコツを取得
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
        if (isGuest) {
            closetItems = closetItems.filter(item => !selectedItems.has(item.id));
            saveGuestCloset();
            generateWeeklyOutfitsFromCloset(); // 削除後に予測を作り直す
            toggleEditMode();
            navigate('closet');
            return;
        }
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
            generateWeeklyOutfitsFromCloset(); // 削除後に予測を作り直す
            toggleEditMode();
            navigate('closet');
        } catch(e) {
            alert("削除に失敗しました。");
            console.error(e);
        }
    }
};

// 使い方ガイド（初回自動表示＋ホームの「?」・設定からいつでも開ける）
window.openGuideModal = function() {
    const step = (icon, title, body) =>
        `<div style="display:flex; gap:10px; margin-bottom:14px;">
            <div style="font-size:1.2rem; flex-shrink:0; line-height:1.4;">${icon}</div>
            <div><p style="font-weight:bold; font-size:0.9rem; margin:0 0 2px;">${title}</p>
            <p style="font-size:0.82rem; color:var(--text-secondary); line-height:1.5; margin:0;">${body}</p></div>
        </div>`;
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:85vh; overflow-y:auto;">
            <h3 class="section-title">📖 digi-set の使い方</h3>
            ${step('📷', '① 服を登録', '右下の＋ボタンから写真を撮る/選ぶと、AIが色や季節を自動でタグ付け。内容を確認して保存します。')}
            ${step('👕', '② 1週間のコーデ予測', 'トップス（またはアウター）とボトムスを各1着以上登録すると、ホームに毎日のコーデが表示されます。')}
            ${step('✨', '③ 着こなしのコツ', 'コーデをタップすると、AIが「シャツはイン」などの着こなしのコツを教えてくれます。')}
            ${step('🧪', '④ コーデ検証ルーム', '手持ちの服を自分で組み合わせて、AIに評価してもらえます。')}
            ${step('💬', '⑤ AIスタイリスト相談', 'チャットで服やコーデの相談ができます。')}
            ${step('🛍', '⑥ トレンド / 買い足し', '今季のトレンドや、買い足すと着回しが広がる服（楽天）を提案します。')}
            ${step('🗺', '⑦ お店を探す', '近くのお店をGoogleマップで検索できます。')}
            ${step('📅', '⑧ 着用履歴', '着た日を記録して、カレンダーで振り返れます。')}
            <div style="background:var(--primary-light); border-radius:8px; padding:10px 12px; font-size:0.8rem; color:var(--text-secondary); margin-bottom:16px;">💡 <strong>お試しモード</strong>：ログインなしで使えます。ただしタブ/ブラウザを閉じるとデータは消えます。ずっと保存したいときはログインしてください。</div>
            <button onclick="closeModal()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer;">はじめる</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
};

// 服の画像を簡易3D（テクスチャを貼った板）にしてGLB化し、model-viewerでAR/3D表示する
window.showItemAR = async function(id) {
    const item = closetItems.find(i => i.id === id);
    if (!item || !item.image) return;
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content text-center">
            <h3 class="section-title">📱 ARで見る</h3>
            <div id="ar-body"><p style="color:var(--text-secondary);"><i data-lucide="loader" class="spinner inline-icon"></i> 3Dデータを準備中...</p></div>
            <button onclick="closeModal()" class="btn-outline text-center mt-4">閉じる</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    try {
        const THREE = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/+esm');
        const { GLTFExporter } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/GLTFExporter.js/+esm');
        const tex = await new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(item.image, resolve, undefined, reject);
        });
        if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
        const im = tex.image;
        const aspect = (im && im.width && im.height) ? (im.width / im.height) : 1;
        const w = 0.6, h = w / aspect; // 横幅0.6mの板
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true })
        );
        const scene = new THREE.Scene();
        scene.add(mesh);
        const glb = await new Promise((resolve, reject) => {
            new GLTFExporter().parse(scene, resolve, reject, { binary: true });
        });
        const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
        const body = document.getElementById('ar-body');
        if (!body) { URL.revokeObjectURL(url); return; }
        body.innerHTML = `
            <model-viewer src="${url}" alt="${item.subCategory || item.category}" camera-controls auto-rotate
                ar ar-modes="webxr scene-viewer" ar-scale="fixed"
                style="width:100%; height:320px; background:var(--primary-light); border-radius:12px;">
                <button slot="ar-button" style="position:absolute; bottom:12px; left:50%; transform:translateX(-50%); background:var(--primary-color); color:#fff; border:none; padding:10px 18px; border-radius:20px; font-weight:bold; cursor:pointer;">📱 ARで部屋に置く</button>
            </model-viewer>
            <p style="font-size:0.78rem; color:var(--text-secondary); margin-top:8px;">スマホ（Android対応）なら「ARで部屋に置く」で実寸イメージを配置できます。iPhone・PCは3D表示のみ（指で回転）。</p>`;
    } catch (e) {
        const body = document.getElementById('ar-body');
        if (body) body.innerHTML = `<p style="color:var(--text-secondary); font-size:0.85rem;">3Dデータの生成に失敗しました。通信環境を確認して、もう一度お試しください。</p>`;
        console.warn('AR生成エラー:', e);
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
            ${'' /* 「ARで見る」ボタンは一旦非表示（第10回）。復活時はここに showItemAR を呼ぶボタンを戻す。関数 showItemAR 本体は残してある。 */}
            <button id="fav-detail-${item.id}" onclick="toggleFavorite('${item.id}')" style="width:100%; background:var(--surface-solid); padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer; color:${item.favorite ? '#f59e0b' : 'var(--text-secondary)'}; border:2px solid ${item.favorite ? '#f59e0b' : 'rgba(0,0,0,0.15)'};">${item.favorite ? '★ お気に入り' : '☆ お気に入りに追加'}</button>
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
    const filtered = closetItems.filter(item => {
        if (activeFilters.category.length > 0 && !activeFilters.category.includes(item.category)) return false;
        if (activeFilters.colors.length > 0 && !activeFilters.colors.some(c => (item.colors || []).includes(c))) return false;
        if (activeFilters.styles.length > 0 && !activeFilters.styles.some(s => (item.styles || []).includes(s))) return false;
        if (activeFilters.seasons.length > 0 && !activeFilters.seasons.some(s => (item.seasons || []).includes(s))) return false;
        return true;
    });
    return sortClosetItems(filtered);
}

// クローゼット画像の並び順を適用（新しい順／古い順／カテゴリ順）
function sortClosetItems(items) {
    const arr = items.slice();
    if (closetSort === 'oldest') {
        arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    } else if (closetSort === 'category') {
        const order = Object.keys(CATEGORIES); // CATEGORIES定義順をカテゴリの並び優先度に使う
        arr.sort((a, b) => {
            const ia = order.indexOf(a.category), ib = order.indexOf(b.category);
            const ca = ia < 0 ? 999 : ia, cb = ib < 0 ? 999 : ib;
            if (ca !== cb) return ca - cb;
            return (b.createdAt || 0) - (a.createdAt || 0); // 同カテゴリ内は新しい順
        });
    } else if (closetSort === 'favorite') {
        arr.sort((a, b) => {
            const fa = a.favorite ? 1 : 0, fb = b.favorite ? 1 : 0;
            if (fa !== fb) return fb - fa;                     // お気に入りを先頭に
            return (b.createdAt || 0) - (a.createdAt || 0);    // 同グループ内は新しい順
        });
    } else {
        arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // newest（既定）
    }
    return arr;
}

window.setClosetSort = function(order) {
    closetSort = ['newest', 'oldest', 'category', 'favorite'].includes(order) ? order : 'newest';
    try { localStorage.setItem('closet_sort', closetSort); } catch(e) {}
    navigate('closet');
};

// お気に入り（星）の切り替え。クローゼットの服に favorite フラグを持たせる。
window.toggleFavorite = async function(id) {
    const it = closetItems.find(i => i.id === id);
    if (!it) return;
    it.favorite = !it.favorite;
    // 星ボタンの見た目を即時反映（一覧・詳細のどちらが開いていても）
    const gridBtn = document.getElementById('fav-btn-' + id);
    if (gridBtn) { gridBtn.textContent = it.favorite ? '★' : '☆'; gridBtn.style.color = it.favorite ? '#f59e0b' : '#9ca3af'; }
    const detailBtn = document.getElementById('fav-detail-' + id);
    if (detailBtn) {
        detailBtn.innerHTML = it.favorite ? '★ お気に入り' : '☆ お気に入りに追加';
        detailBtn.style.color = it.favorite ? '#f59e0b' : 'var(--text-secondary)';
        detailBtn.style.borderColor = it.favorite ? '#f59e0b' : 'rgba(0,0,0,0.15)';
    }
    // 保存（ゲスト=端末内 / ログイン=Firestore。favorite だけ更新なので他項目は保持）
    try {
        if (isGuest) { saveGuestCloset(); }
        else if (currentUser) { await updateDoc(doc(db, "closetItems", id), { favorite: it.favorite }); }
    } catch (e) { console.error('お気に入りの保存に失敗', e); }
};

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
                <p>タップして1枚ずつ登録<br><span style="font-size: 0.8rem; opacity: 0.8;">カメラ撮影 または 画像を選択</span></p>
                <p style="font-size:0.75rem; margin-top:8px; opacity:0.7;">✨ AIが服を自動認識します</p>
            </div>
            <button id="btn-bulk-add" style="width:100%; background:var(--accent-color); color:#fff; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-top:12px; display:flex; align-items:center; justify-content:center; gap:8px;">
                <i data-lucide="layers" class="inline-icon"></i> まとめて登録（複数枚・AIおまかせ）
            </button>
            <p style="font-size:0.72rem; color:var(--text-secondary); text-align:center; margin-top:6px;">手持ちの服を一気に登録。タグはAIにおまかせ（あとで編集可）。</p>
            <button onclick="closeModal()" class="btn-outline mt-4 text-center">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('upload-area').addEventListener('click', () => { closeModal(); nativeCameraInput.click(); });
    document.getElementById('btn-bulk-add').addEventListener('click', () => { closeModal(); startBulkAdd(); });
});

let currentUploadedImage = null;
nativeCameraInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (ev) => { currentUploadedImage = await compressImage(ev.target.result); showAIAnalysisModal(); };
        reader.readAsDataURL(file);
    }
});

// =============================================
// まとめて登録（複数枚・AIおまかせ）
// =============================================
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = (e) => resolve(e.target.result);
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 画像を縮小・圧縮（長辺maxSize・JPEG）。容量削減＆アップロード高速化。失敗時は元画像を返す。
function compressImage(dataUrl, maxSize = 800, quality = 0.7) {
    return new Promise((resolve) => {
        try {
            const img = new Image();
            img.onload = () => {
                try {
                    let w = img.width, h = img.height;
                    if (w > maxSize || h > maxSize) {
                        if (w >= h) { h = Math.round(h * maxSize / w); w = maxSize; }
                        else { w = Math.round(w * maxSize / h); h = maxSize; }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                } catch (e) { resolve(dataUrl); }
            };
            img.onerror = () => resolve(dataUrl);
            img.src = dataUrl;
        } catch (e) { resolve(dataUrl); }
    });
}

// 1枚をAIで解析してタグ情報を返す（失敗時は無難なデフォルト）
// imageUrl を渡すと画像取得を Worker 側に任せる（ログインユーザーのStorage画像・CORS回避）
async function analyzeGarment(imageDataUrl, imageUrl = null) {
    const data = { image: imageDataUrl, category: "トップス", subCategory: "", colors: ["白"], lightness: "指定なし", styles: ["カジュアル系"], seasons: ["オールシーズン"], memo: "", size: "", gender: "男女兼用" };
    const prompt = `この服の画像を分析して、以下のJSON形式のみで回答してください（余分な説明・コードブロック不要）：
{"category":"トップス または アウター または ボトムス または 帽子 または 靴 または ワンピース または ドレス または スーツ または 小物 のいずれか（羽織るものは「アウター」、バッグ・ベルト・ネクタイ・小物類は「小物」）","subCategory":"カテゴリに合った種類","colors":["赤 青 黄 緑 むらさき ピンク オレンジ ベージュ グレー 黒 白 から1〜2つ"],"styles":["カジュアル系 きれいめ（シンプル）系 エレガント系 クール系 フォーマル系 ストリート系 フェミニン・ガーリー系 アウトドア系 アメカジ系 から1〜2つ"],"seasons":["春 夏 秋 冬 オールシーズン から1つ以上"]}`;
    // レート制限/一時失敗に備えて最大2回試行（2回目は少し待つ）
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const result = imageUrl ? await callGemini(prompt, null, { imageUrl }) : await callGemini(prompt, imageDataUrl);
            const m = result && result.match(/\{[\s\S]*\}/);
            if (m) {
                const p = JSON.parse(m[0]);
                if (CATEGORIES.hasOwnProperty(p.category)) data.category = p.category;
                if (typeof p.subCategory === 'string') data.subCategory = p.subCategory;
                if (Array.isArray(p.colors)) { const c = p.colors.filter(x => COLORS.includes(x)); if (c.length) data.colors = c; }
                if (Array.isArray(p.styles)) { const s = p.styles.filter(x => STYLES.includes(x)); if (s.length) data.styles = s; }
                if (Array.isArray(p.seasons)) { const se = p.seasons.filter(x => SEASONS.includes(x)); if (se.length) data.seasons = se; }
                return data;
            }
        } catch (e) { /* リトライへ */ }
        if (attempt === 0) await sleep(1500); // 1回目失敗時に小休止してから再試行
    }
    return data; // 失敗時は無難なデフォルト
}

// 1点を保存（ゲスト=sessionStorage / ログイン=Firestore+Storage）
async function saveBulkItem(fields, idx) {
    if (isGuest) {
        closetItems.unshift({ id: 'g' + Date.now() + '-' + idx, createdAt: Date.now() + idx, ...fields });
        saveGuestCloset();
        return;
    }
    if (!currentUser) return;
    const imgRef = ref(storage, 'images/' + currentUser.uid + '/' + Date.now() + '-' + idx + '.jpg');
    await uploadString(imgRef, fields.image, 'data_url');
    const url = await getDownloadURL(imgRef);
    const docData = {
        userId: currentUser.uid, createdAt: Date.now() + idx, image: url,
        category: fields.category, subCategory: fields.subCategory, colors: fields.colors,
        lightness: fields.lightness, styles: fields.styles, seasons: fields.seasons,
        memo: '', size: '', gender: fields.gender || '男女兼用'
    };
    const docRef = await addDoc(collection(db, "closetItems"), docData);
    closetItems.unshift({ id: docRef.id, ...docData });
}

function showBulkProgressModal(total) {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content text-center">
            <h3 class="section-title">まとめて登録中…</h3>
            <i data-lucide="loader" class="spinner" style="width:32px; height:32px; color:var(--primary-color); display:block; margin:0 auto 12px;"></i>
            <p id="bulk-progress" style="font-weight:600;">0 / ${total} 点</p>
            <p style="font-size:0.78rem; color:var(--text-secondary); margin-top:8px;">AIが1枚ずつ自動でタグ付けしています…</p>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
}
function updateBulkProgress(done, total) {
    const el = document.getElementById('bulk-progress');
    if (el) el.textContent = `${done} / ${total} 点`;
}

// 複数ファイルを順に解析→保存
async function bulkAddImages(fileList) {
    const BULK_MAX = 15; // 1回のレート制限/負荷を抑えるためのバッチ上限
    let files = Array.from(fileList).filter(f => f.type && f.type.startsWith('image/'));
    if (files.length === 0) return;
    // ゲストは残り枠まで
    if (isGuest) {
        const room = GUEST_MAX_ITEMS - closetItems.length;
        if (room <= 0) { alert(`お試しモードは${GUEST_MAX_ITEMS}点まで登録できます。続きはログインしてご利用ください。`); return; }
        if (files.length > room) { files = files.slice(0, room); alert(`お試しモードは残り${room}点までです。先頭${room}枚を登録します。`); }
    }
    // 1回のバッチ上限（AIレート制限対策）
    if (files.length > BULK_MAX) {
        alert(`一度に登録できるのは${BULK_MAX}枚までです。先頭${BULK_MAX}枚を登録します（残りはもう一度お試しください）。`);
        files = files.slice(0, BULK_MAX);
    }
    const total = files.length;
    showBulkProgressModal(total);
    let ok = 0;
    for (let i = 0; i < total; i++) {
        try {
            let dataUrl = await readFileAsDataURL(files[i]);
            dataUrl = await compressImage(dataUrl); // 縮小・圧縮（容量＆通信を節約）
            const fields = await analyzeGarment(dataUrl);
            await saveBulkItem(fields, i);
            ok++;
        } catch (e) { console.warn('一括登録: 1件スキップ', e); }
        updateBulkProgress(i + 1, total);
        if (i < total - 1) await sleep(1000); // 呼び出し間に小休止（レート制限対策。callGemini側でも429は自動リトライ）
    }
    if (typeof generateWeeklyOutfitsFromCloset === 'function') generateWeeklyOutfitsFromCloset();
    closeModal();
    navigate('closet');
    setTimeout(() => alert(`${ok}点を登録しました。タグはAIおまかせです。気になる服はタップして編集できます。`), 150);
}

// 複数枚ファイル選択を起動
window.startBulkAdd = function() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.style.display = 'none';
    inp.addEventListener('change', (e) => {
        const fs = e.target.files;
        inp.remove();
        if (fs && fs.length) bulkAddImages(fs);
    });
    document.body.appendChild(inp);
    inp.click();
};

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
{"category":"トップス または アウター または ボトムス または 帽子 または 靴 または ワンピース または ドレス または スーツ または 小物 のいずれか（ジャケット・コート・ブルゾン・ダウン・カーディガンなど羽織るものは「アウター」、バッグ・ベルト・ネクタイ・アクセサリー・眼鏡・サングラス・時計・マフラー・手袋などは「小物」）","subCategory":"カテゴリに合った種類（例：Tシャツ、コート、デニム、スニーカー、バッグ、ネクタイ、眼鏡）","colors":["赤 青 黄 緑 むらさき ピンク オレンジ ベージュ グレー 黒 白 から1〜2つ"],"styles":["カジュアル系 きれいめ（シンプル）系 エレガント系 クール系 フォーマル系 ストリート系 フェミニン・ガーリー系 アウトドア系 アメカジ系 から1〜2つ"],"seasons":["春 夏 秋 冬 オールシーズン から1つ以上"]}`;

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
        size: baseItem.size || "",
        gender: baseItem.gender || "男女兼用"
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
            <img src="${currentEditData.image}" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:12px;" alt="clothing">

            <button type="button" id="btn-reanalyze" onclick="reanalyzeEditImage()" style="width:100%; background:var(--surface-solid); color:var(--primary-color); border:2px solid var(--primary-color); padding:10px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:16px; cursor:pointer;">🔁 この画像をAIで再解析</button>

            <div class="form-group"><label>カテゴリ</label>
                <div class="form-btn-group">${renderSingleBtn('category', Object.keys(CATEGORIES))}</div>
            </div>
            ${subCatHtml}

            <div class="form-group"><label>対象</label>
                <div class="form-btn-group">${renderSingleBtn('gender', GENDERS)}</div>
            </div>

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
                ${isNew ? (isGuest ? '📱 保存（お試し・端末内）' : '☁️ クラウドに保存') : '変更を保存'}
            </button>
            <button onclick="closeModal()" class="btn-outline text-center">キャンセル</button>
        </div>
    `;
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('btn-save-item').addEventListener('click', () => saveItemData(isNew, existingId));
}

// 編集中の画像をAIで再解析し、種類・色・スタイル・季節を付け直す（画像・対象・サイズ・メモは保持）
window.reanalyzeEditImage = async function() {
    const btn = document.getElementById('btn-reanalyze');
    const orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '🔍 AIが再解析中...'; }
    try {
        const src = currentEditData.image || '';
        let fields;
        if (src.startsWith('data:')) {
            // ゲスト等：端末内の data URL を圧縮して送る
            const dataUrl = await compressImage(src);
            fields = await analyzeGarment(dataUrl);
        } else {
            // ログイン：Storage等のURLは Worker 側で取得（ブラウザのCORSを回避）
            fields = await analyzeGarment(null, src);
        }
        currentEditData.category = fields.category;
        currentEditData.subCategory = fields.subCategory;
        currentEditData.colors = fields.colors;
        currentEditData.styles = fields.styles;
        currentEditData.seasons = fields.seasons;
        renderEditFormContent(); // 結果を反映して再描画（ボタンも元に戻る）
    } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = orig || '🔁 この画像をAIで再解析'; }
        alert('画像の再解析に失敗しました。時間をおいて再度お試しください。');
    }
};

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
    // お試し（ゲスト）モード：セッション内(sessionStorage)に保存。タブを閉じると消える＝他のゲストとかぶらない。画像はそのまま(base64)、クラウド不使用
    if (isGuest) {
        currentEditData.memo = document.getElementById('input-memo')?.value || '';
        currentEditData.size = document.getElementById('input-size')?.value || '';
        if (isNew && closetItems.length >= GUEST_MAX_ITEMS) {
            alert(`お試しモードは${GUEST_MAX_ITEMS}点まで登録できます。もっと登録・クラウド保存するにはログインしてください。`);
            return;
        }
        if (!guestSaveConfirm()) return;
        const fields = {
            image: currentEditData.image,
            category: currentEditData.category, subCategory: currentEditData.subCategory,
            colors: currentEditData.colors, lightness: currentEditData.lightness,
            styles: currentEditData.styles, seasons: currentEditData.seasons,
            memo: currentEditData.memo, size: currentEditData.size, gender: currentEditData.gender
        };
        if (isNew) {
            closetItems.unshift({ id: 'g' + Date.now(), createdAt: Date.now(), ...fields });
            nativeCameraInput.value = '';
        } else {
            const target = closetItems.find(i => i.id === existingId);
            if (target) Object.assign(target, fields);
        }
        saveGuestCloset();
        generateWeeklyOutfitsFromCloset(); // 追加後に予測を作り直す
        closeModal();
        navigate('closet');
        return;
    }
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
                size: currentEditData.size,
                gender: currentEditData.gender
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
                size: currentEditData.size,
                gender: currentEditData.gender
            };
            await updateDoc(doc(db, "closetItems", existingId), updateData);
            const target = closetItems.find(i => i.id === existingId);
            if (target) Object.assign(target, updateData);
        }
        generateWeeklyOutfitsFromCloset(); // 追加・編集後に予測を作り直す
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
            <button onclick="openCoordRoomModal()" class="btn-outline text-center mt-4">戻る</button>
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
        <button onclick="showCoordPreview()" style="width:100%; background:var(--surface-solid); color:var(--primary-color); border:2px solid var(--primary-color); padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-bottom:8px;">
            👕 コーデの見え方を見る
        </button>
        <button onclick="analyzeCoordination()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-bottom:8px;">
            <i data-lucide="sparkles" class="inline-icon"></i> AIで分析する
        </button>`;
    }

    html += `<button onclick="resetCoord()" class="btn-outline text-center" style="font-size:0.8rem; padding:8px; margin-top:4px;">最初からやり直す</button>`;
    html += `<div id="coord-result" class="hidden mt-4" style="background:var(--primary-light); padding:16px; border-radius:8px; font-size:0.9rem; line-height:1.5;"></div>`;
    return html;
}

function refreshCoordRoom() {
    // コーデ検証ルームはモーダル表示なので、モーダルごと再描画して状態を反映
    if (document.getElementById('coord-room')) openCoordRoomModal();
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

// コーデの「見え方」プレビュー（本格的な試着ではなく、選んだ服を上から順に並べた見え方確認。AI・課金なし）
window.showCoordPreview = function() {
    const cs = coordState;
    const isOne = cs.type === 'onepiece';
    // 着る順（上→下）に並べる：帽子→トップス/ワンピース→ボトムス→靴。小物は別枠で表示。
    const rows = [];
    if (cs.hat)   rows.push({ img: cs.hat.image,   label: cs.hat.subCategory   || '帽子',   w: 74 });
    if (cs.tops)  rows.push({ img: cs.tops.image,  label: cs.tops.subCategory  || (isOne ? 'ワンピース' : 'トップス'), w: 150 });
    if (!isOne && cs.bottoms) rows.push({ img: cs.bottoms.image, label: cs.bottoms.subCategory || 'ボトムス', w: 140 });
    if (cs.shoes) rows.push({ img: cs.shoes.image, label: cs.shoes.subCategory || '靴', w: 92 });

    const board = rows.map(r => `
        <div style="text-align:center;">
            <img src="${r.img}" style="width:${r.w}px; max-width:72%; aspect-ratio:1/1.05; object-fit:cover; border-radius:12px; box-shadow:0 3px 10px rgba(0,0,0,0.12);" alt="">
            <p style="font-size:0.7rem; color:var(--text-secondary); margin:4px 0 0;">${r.label}</p>
        </div>`).join('<div style="height:10px;"></div>');

    const acc = cs.accessory ? `
        <div style="margin-top:12px; display:flex; align-items:center; gap:8px; justify-content:center;">
            <img src="${cs.accessory.image}" style="width:48px; height:48px; object-fit:cover; border-radius:10px;" alt="">
            <span style="font-size:0.72rem; color:var(--text-secondary);">＋ ${cs.accessory.subCategory || '小物'}（合わせる）</span>
        </div>` : '';

    const empty = rows.length === 0;
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:85vh; overflow-y:auto;">
            <h3 class="section-title">👕 コーデの見え方</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:14px; line-height:1.6;">選んだアイテムを上から順に並べた“見え方”プレビューです（本格的な試着ではありません。セットの雰囲気を確認する用）。</p>
            ${empty
                ? '<p style="color:var(--text-secondary); font-size:0.88rem;">先にトップス（またはワンピース）などを選んでください。</p>'
                : `<div style="background:linear-gradient(180deg,#f3f7fb,#e7eef7); border-radius:16px; padding:20px 12px; display:flex; flex-direction:column; align-items:center;">${board}${acc}</div>`}
            <button onclick="openCoordRoomModal()" class="btn-outline text-center mt-4">戻る</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', () => openCoordRoomModal());
};

window.selectForCoord = function(id) {
    const item = closetItems.find(i => i.id === id);
    if (currentTargetSlot === 'トップス・アウター' || currentTargetSlot === 'ワンピース') coordState.tops = item;
    else if (currentTargetSlot === 'ボトムス') coordState.bottoms = item;
    else if (currentTargetSlot === '靴') coordState.shoes = item;
    else if (currentTargetSlot === '帽子') coordState.hat = item;
    else if (currentTargetSlot === '小物') coordState.accessory = item;
    openCoordRoomModal(); // 選択したらピッカー（タブ）を閉じ、検証ルームに戻して選択を反映
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
        return { images: img ? [img] : [], title: h.title || 'コーデ記録', occasion: h.occasion || '' };
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
        <div style="border-bottom:1px solid rgba(0,0,0,0.05); padding-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <div style="flex:1; min-width:0; cursor:pointer;" onclick="openHistoryDetail('${h.id}')">
                    <p style="font-size:0.75rem; color:var(--primary-color); font-weight:bold; margin:0;">${h.dateStr}</p>
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px; margin-top:3px;">
                        <span style="font-size:0.9rem; font-weight:bold;">${display.title}</span>
                        ${occasionBadge}
                    </div>
                    ${h.memo ? `<p style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px; line-height:1.6;">${h.memo}</p>` : ''}
                </div>
                <div style="display:flex; flex-direction:column; gap:2px; flex-shrink:0;">
                    <button onclick="openHistoryEdit('${h.id}')" style="background:none; border:none; color:var(--primary-color); cursor:pointer; padding:6px;">
                        <i data-lucide="pencil" style="width:15px; height:15px;"></i>
                    </button>
                    <button onclick="deleteHistoryItem('${h.id}')" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:6px;">
                        <i data-lucide="trash-2" style="width:15px; height:15px;"></i>
                    </button>
                </div>
            </div>
            <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; cursor:pointer;" onclick="openHistoryDetail('${h.id}')">${thumbsHtml}</div>
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

// 予定（ユーザー自身が入力）：ログイン=localStorage / ゲスト=sessionStorage に、ユーザー別・日付別で保存
function getSchedule(iso) {
    const key = userKey();
    if (!key) return '';
    return userStore().getItem(`schedule_${key}_${iso}`) || '';
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
    if (val && !guestSaveConfirm()) return;
    const key = userKey();
    if (key) {
        if (val) userStore().setItem(`schedule_${key}_${iso}`, val);
        else userStore().removeItem(`schedule_${key}_${iso}`);
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

// ===== 着用履歴 統一エディタ（記録・編集 共通。カテゴリ別・複数追加＋✕削除） =====
// カテゴリのグループ（コーデ検証ルームに合わせた括り）
const HIST_CATS = [
    { label: 'トップス／アウター', cats: ['トップス', 'トップス・アウター', 'アウター'] },
    { label: 'ワンピース',        cats: ['ワンピース', 'ドレス'] },
    { label: 'スーツ',            cats: ['スーツ'] },
    { label: 'ボトムス',          cats: ['ボトムス'] },
    { label: '帽子',              cats: ['帽子'] },
    { label: '靴',                cats: ['靴'] },
    { label: '小物',              cats: ['小物'] },
];
let histEditState = { mode: 'add', id: null, date: '', occasion: '', memo: '' };

// 記録を編集で開く
window.openHistoryEdit = function(id) {
    closeModal();
    const h = wearHistory.find(x => x.id === id);
    if (!h) return;
    // この記録の服をクローゼットと突き合わせて初期選択に（closetItemId か 画像URL で一致判定）
    const recImgs = (h.items || []).map(it => it.image).filter(Boolean);
    const recIds  = (h.items || []).map(it => it.closetItemId).filter(Boolean);
    selectedHistoryItems = new Set(
        closetItems.filter(ci => recIds.includes(ci.id) || recImgs.includes(ci.image)).map(ci => ci.id)
    );
    histEditState = {
        mode: 'edit', id,
        date: h.isoDate || (h.createdAt ? new Date(h.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
        occasion: h.occasion || '', memo: h.memo || ''
    };
    renderHistoryEditor();
};

// 画面の入力値を state に退避（再描画で消えないように）
function syncHistState() {
    const d = document.getElementById('hist-date'); if (d) histEditState.date = d.value;
    const o = document.getElementById('hist-occasion'); if (o) histEditState.occasion = o.value;
    const m = document.getElementById('hist-memo'); if (m) histEditState.memo = m.value;
}

// 選択中の服をカテゴリ別に表示（各画像に✕、各カテゴリに＋追加、未選択カテゴリは＋チップ）
function renderHistItemsHTML() {
    const selected = [...selectedHistoryItems].map(id => closetItems.find(i => i.id === id)).filter(Boolean);
    let rows = '';
    HIST_CATS.forEach((g, gi) => {
        const inCat = selected.filter(ci => g.cats.includes(ci.category));
        if (inCat.length === 0) return;
        const thumbs = inCat.map(ci => `
            <div style="position:relative;">
                <img src="${ci.image}" style="width:72px; height:72px; object-fit:cover; border-radius:10px;" alt="">
                <button onclick="removeHistItem('${ci.id}')" aria-label="削除" style="position:absolute; top:-6px; right:-6px; width:22px; height:22px; border-radius:50%; background:#ef4444; color:#fff; border:2px solid var(--surface-solid); font-size:12px; line-height:1; padding:0; cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
            </div>`).join('');
        rows += `<p style="font-size:0.75rem; color:var(--text-secondary); margin:0 0 6px;">${g.label}</p>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; align-items:center;">
                ${thumbs}
                <button onclick="openHistCatPicker(${gi})" style="width:72px; height:72px; border-radius:10px; border:2px dashed var(--primary-color); background:transparent; color:var(--primary-color); font-size:0.72rem; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px;"><span style="font-size:1.1rem;">＋</span>追加</button>
            </div>`;
    });
    const emptyChips = HIST_CATS.map((g, gi) => {
        if (selected.some(ci => g.cats.includes(ci.category))) return '';
        return `<button onclick="openHistCatPicker(${gi})" style="border:1px solid var(--primary-color); border-radius:16px; padding:5px 12px; background:transparent; color:var(--primary-color); font-size:0.75rem; cursor:pointer;">＋ ${g.label}</button>`;
    }).filter(Boolean).join('');
    const emptyBlock = emptyChips
        ? `<div style="display:flex; gap:8px; flex-wrap:wrap; padding-top:8px; ${rows ? 'border-top:0.5px solid rgba(0,0,0,0.08);' : ''}"><span style="font-size:0.72rem; color:var(--text-secondary); align-self:center;">追加:</span>${emptyChips}</div>`
        : '';
    const noneMsg = selected.length === 0 ? '<p style="font-size:0.8rem; color:var(--text-secondary); margin:0 0 8px;">下のボタンから、着た服をカテゴリごとに追加できます（各カテゴリ複数OK）。</p>' : '';
    return noneMsg + rows + emptyBlock;
}

// エディタ本体を描画
function renderHistoryEditor() {
    const isEdit = histEditState.mode === 'edit';
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:88vh; overflow-y:auto;">
            <h3 class="section-title">${isEdit ? '着用履歴を編集' : '👗 着用を記録する'}</h3>
            <div class="form-group">
                <label style="font-weight:600; font-size:0.9rem;">着用日</label>
                <input type="date" id="hist-date" class="input-field" value="${histEditState.date}" style="margin-top:6px;">
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-weight:600; font-size:0.9rem;">シーン（任意）</label>
                <input type="text" id="hist-occasion" class="input-field" value="${(histEditState.occasion || '').replace(/"/g,'&quot;')}" placeholder="例：仕事、デートなど" style="margin-top:6px;">
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-weight:600; font-size:0.9rem;">メモ（任意）</label>
                <input type="text" id="hist-memo" class="input-field" value="${(histEditState.memo || '').replace(/"/g,'&quot;')}" placeholder="例：暑かった、気に入った組み合わせ" style="margin-top:6px;">
            </div>
            <div class="form-group" style="margin-top:12px;">
                <label style="font-weight:600; font-size:0.9rem;">着た服（カテゴリごとに複数OK）</label>
                <div style="margin-top:8px;">${renderHistItemsHTML()}</div>
            </div>
            <button onclick="saveHistoryRecord()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; cursor:pointer; margin-top:16px; margin-bottom:8px;">保存する</button>
            <button onclick="closeModal()" class="btn-outline text-center">キャンセル</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
}

// renderHistoryEditor はインラインの onclick（「戻る」ボタン）からも呼ぶので window に公開する
// （app.js は type="module" のため、公開しないと onclick から参照できず「戻る」が効かない）
window.renderHistoryEditor = renderHistoryEditor;

// カテゴリを絞ってクローゼットから選ぶ画面（＋追加を押すと開く）
window.openHistCatPicker = function(groupIndex) {
    syncHistState();
    const g = HIST_CATS[groupIndex];
    if (!g) return;
    const items = closetItems.filter(ci => g.cats.includes(ci.category));
    const gridHtml = items.length === 0
        ? `<p style="color:var(--text-secondary); font-size:0.85rem; text-align:center; padding:20px;">「${g.label}」の服がクローゼットにありません。</p>`
        : `<div class="closet-grid">${items.map(item => {
            const sel = selectedHistoryItems.has(item.id);
            return `<div class="closet-item ${sel ? 'selected' : ''}" onclick="pickHistItem('${item.id}')" style="cursor:pointer; position:relative;">
                <img src="${item.image}" alt="">
                <div class="item-tags"><span class="tag-small">${item.subCategory || item.category}</span></div>
                ${sel ? `<span style="position:absolute; top:4px; right:4px; background:var(--primary-color); color:#fff; font-size:0.6rem; padding:1px 6px; border-radius:8px;">追加済み</span>` : ''}
            </div>`;
        }).join('')}</div>`;
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:88vh; overflow-y:auto;">
            <h3 class="section-title">${g.label}を選ぶ</h3>
            <p style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:10px;">服をタップすると追加して自動で戻ります。もう1つ足したいときは、戻った先で「＋追加」をもう一度。</p>
            ${gridHtml}
            <button onclick="renderHistoryEditor()" class="btn-outline text-center" style="margin-top:12px;">追加せずに戻る</button>
        </div>`;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', () => renderHistoryEditor());
};

// ピッカーで服を1つ選ぶ → 追加してエディタに自動で戻る（「戻る」に気付かない問題への対策）
window.pickHistItem = function(id) {
    selectedHistoryItems.add(id);
    renderHistoryEditor();
};

// エディタ上で1枚だけ削除（✕）
window.removeHistItem = function(id) {
    selectedHistoryItems.delete(id);
    syncHistState();
    renderHistoryEditor();
};

// 保存（記録・編集 共通）
window.saveHistoryRecord = async function() {
    syncHistState();
    const dateInput = histEditState.date;
    const occasion  = (histEditState.occasion || '').trim();
    const memo      = (histEditState.memo || '').trim();
    if (!dateInput) { alert('着用日を入力してください。'); return; }
    const dateObj = new Date(dateInput);
    const dateStr = dateObj.toLocaleDateString('ja-JP', {year:'numeric', month:'long', day:'numeric'}) + ' 着用';
    const isoDate = dateInput;
    const items = [...selectedHistoryItems].map(cid => {
        const ci = closetItems.find(i => i.id === cid);
        if (!ci) return null;
        return { closetItemId: ci.id, image: ci.image, category: ci.category, subCategory: ci.subCategory || '', title: ci.subCategory || ci.category };
    }).filter(Boolean);

    if (histEditState.mode === 'edit') {
        const id = histEditState.id;
        const fields = { occasion, memo, dateStr, isoDate, createdAt: dateObj.getTime(), items };
        if (isGuest) {
            if (!guestSaveConfirm()) return;
            const gi = wearHistory.findIndex(h => h.id === id);
            if (gi !== -1) Object.assign(wearHistory[gi], fields);
            wearHistory.sort((a, b) => b.createdAt - a.createdAt);
            saveGuestHistory(); closeModal(); navigate('history'); return;
        }
        try {
            await updateDoc(doc(db, "history", id), fields);
            const gi = wearHistory.findIndex(h => h.id === id);
            if (gi !== -1) Object.assign(wearHistory[gi], fields);
            wearHistory.sort((a, b) => b.createdAt - a.createdAt);
            closeModal(); navigate('history');
        } catch(e) { alert('保存に失敗しました。'); console.error(e); }
    } else {
        if (isGuest) {
            if (!guestSaveConfirm()) return;
            wearHistory.unshift({ id: 'g' + Date.now(), dateStr, isoDate, occasion, items, memo, createdAt: dateObj.getTime() });
            wearHistory.sort((a, b) => b.createdAt - a.createdAt);
            saveGuestHistory(); selectedHistoryItems = new Set(); closeModal(); navigate('history'); return;
        }
        if (!currentUser) return;
        try {
            const docData = { userId: currentUser.uid, dateStr, isoDate, occasion, items, memo, createdAt: dateObj.getTime() };
            const docRef = await addDoc(collection(db, "history"), docData);
            wearHistory.unshift({ id: docRef.id, ...docData });
            wearHistory.sort((a, b) => b.createdAt - a.createdAt);
            selectedHistoryItems = new Set(); closeModal(); navigate('history');
        } catch(e) { alert('保存に失敗しました。'); console.error(e); }
    }
};

window.saveHistoryEdit = async function(id) {
    const dateInput  = document.getElementById('edit-history-date')?.value;
    const occasion   = document.getElementById('edit-history-occasion')?.value?.trim() || '';
    const memo       = document.getElementById('edit-history-memo')?.value?.trim() || '';
    if (!dateInput) { alert('着用日を入力してください。'); return; }

    const dateObj = new Date(dateInput);
    const dateStr = dateObj.toLocaleDateString('ja-JP', {year:'numeric', month:'long', day:'numeric'}) + ' 着用';
    const isoDate = dateInput;

    // 選択した服で「この日の着用」を作り直す（間違えて記録した服の修正・追加・削除に対応）
    const items = [...selectedHistoryItems].map(cid => {
        const ci = closetItems.find(i => i.id === cid);
        if (!ci) return null;
        return { closetItemId: ci.id, image: ci.image, category: ci.category, subCategory: ci.subCategory || '', title: ci.subCategory || ci.category };
    }).filter(Boolean);
    const fields = { occasion, memo, dateStr, isoDate, createdAt: dateObj.getTime(), items };

    if (isGuest) {
        if (!guestSaveConfirm()) return;
        const gidx = wearHistory.findIndex(h => h.id === id);
        if (gidx !== -1) Object.assign(wearHistory[gidx], fields);
        wearHistory.sort((a, b) => b.createdAt - a.createdAt);
        saveGuestHistory();
        closeModal();
        navigate('history');
        return;
    }
    try {
        await updateDoc(doc(db, "history", id), fields);
        const idx = wearHistory.findIndex(h => h.id === id);
        if (idx !== -1) Object.assign(wearHistory[idx], fields);
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
    if (isGuest) {
        wearHistory = wearHistory.filter(h => h.id !== id);
        saveGuestHistory();
        navigate('history');
        return;
    }
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
    selectedHistoryItems = new Set();
    histEditState = { mode: 'add', id: null, date: new Date().toISOString().split('T')[0], occasion: '', memo: '' };
    renderHistoryEditor();
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
    // 「選択済み」バッジ（編集画面のグリッドにのみ存在）を同期
    const badge = document.getElementById('hist-badge-' + id);
    if (badge) badge.style.display = selectedHistoryItems.has(id) ? 'block' : 'none';
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
