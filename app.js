import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-storage.js";

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

let currentUser = null;

const GOOGLE_CLIENT_ID = "129220662304-ep6hsfq62ftri0kcirnv647sbnt0gk73.apps.googleusercontent.com";
let googleTokenClient;
let isCalendarConnected = localStorage.getItem('google_calendar_connected') === 'true';
let calendarEvents = {}; // { "YYYY-MM-DD": "Event summary" }

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

let weeklyOutfits = Array(7).fill().map((_, i) => {
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

const mainContent = document.getElementById('main-content');
const headerTitle = document.getElementById('header-title');
const headerActions = document.getElementById('header-actions');
const navButtons = document.querySelectorAll('.nav-btn');
const fabAdd = document.getElementById('fab-add');
const modalContainer = document.getElementById('modal-container');
const nativeCameraInput = document.getElementById('native-camera-input');
const authOverlay = document.getElementById('auth-overlay');
const authError = document.getElementById('auth-error');

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
    if(!email || !pass) { authError.textContent = "メールアドレスとパスワードを入力してください"; return; }
    try {
        await createUserWithEmailAndPassword(auth, email, pass);
    } catch(e) { authError.textContent = "登録エラー: " + e.message; }
});

document.getElementById('btn-email-login').addEventListener('click', async () => {
    authError.textContent = "";
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    if(!email || !pass) { authError.textContent = "メールアドレスとパスワードを入力してください"; return; }
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) { authError.textContent = "ログインエラー: " + e.message; }
});

window.logout = async function() {
    if(confirm("ログアウトしますか？")) {
        await signOut(auth);
        navigate('home');
    }
}

async function fetchFirebaseData() {
    if(!currentUser || isDataLoaded) return;
    try {
        const qCloset = query(collection(db, "closetItems"), where("userId", "==", currentUser.uid));
        const snapshot = await getDocs(qCloset);
        closetItems = [];
        snapshot.forEach((doc) => { closetItems.push({ id: doc.id, ...doc.data() }); });
        closetItems.sort((a,b) => b.createdAt - a.createdAt);
        
        const qHistory = query(collection(db, "history"), where("userId", "==", currentUser.uid));
        const snapHistory = await getDocs(qHistory);
        wearHistory = [];
        snapHistory.forEach((doc) => { wearHistory.push({ id: doc.id, ...doc.data() }); });
        wearHistory.sort((a,b) => b.createdAt - a.createdAt);
        
        isDataLoaded = true;
        if(currentRoute === 'closet' || currentRoute === 'history') navigate(currentRoute);
    } catch (e) {
        console.error("Firebase読み込みエラー:", e);
    }
}

function updateWeeklyReasons() {
    weeklyOutfits.forEach(outfit => {
        let ev = calendarEvents[outfit.isoDate];
        if(ev) {
            outfit.reason = `予定「${ev}」と気温(${outfit.temp})に合わせて、${outfit.tags.join('・')}なコーデを提案します！`;
        } else {
            outfit.reason = `気温(${outfit.temp})に最適で、リラックスできる${outfit.tags.join('・')}なコーデを選びました！`;
        }
    });
    if(currentRoute === 'home') navigate('home');
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
                        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
                            headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
                        });
                        const data = await res.json();
                        calendarEvents = {};
                        if (data.items) {
                            data.items.forEach(item => {
                                const d = item.start.dateTime || item.start.date;
                                const iso = d.split('T')[0];
                                if(!calendarEvents[iso]) calendarEvents[iso] = item.summary;
                            });
                        }
                        updateWeeklyReasons();
                    } catch(e) { console.error(e); }
                    alert("Googleカレンダーと連携し、1週間の予定を取得しました！");
                    if (currentRoute === 'settings' || currentRoute === 'home') navigate(currentRoute);
                }
            },
        });
    }
}

async function fetchWeather() {
    try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current_weather=true&daily=temperature_2m_max,weathercode&timezone=Asia%2FTokyo');
        const data = await response.json();
        
        const parseWeather = (code) => {
            if (code >= 1 && code <= 3) return { c: "曇り", i: "cloud" };
            if (code >= 45 && code <= 48) return { c: "霧", i: "cloud-fog" };
            if (code >= 51 && code <= 67) return { c: "雨", i: "cloud-rain" };
            if (code >= 71) return { c: "雪", i: "snowflake" };
            return { c: "晴れ", i: "sun" };
        };
        
        if (data.daily) {
            weeklyOutfits.forEach((outfit, index) => {
                if(index < data.daily.time.length) {
                    const w = parseWeather(data.daily.weathercode[index]);
                    outfit.temp = `${Math.round(data.daily.temperature_2m_max[index])}°C`;
                    outfit.condition = w.c;
                    outfit.icon = w.i;
                }
            });
            updateWeeklyReasons();
        }
    } catch (e) { console.error("Weather API error", e); }
}

setInterval(() => {
    const now = new Date();
    const clockEl = document.getElementById('realtime-clock');
    const dateEl = document.getElementById('realtime-date');
    if(clockEl && dateEl) {
        clockEl.textContent = now.toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
        dateEl.textContent = now.toLocaleDateString('ja-JP', {month: 'short', day: 'numeric', weekday: 'short'});
    }
}, 1000);

// Helper for formatting tags
function formatTags(item) {
    let tags = [];
    if(item.subCategory) tags.push(item.subCategory);
    else if(item.category) tags.push(item.category);
    
    if(item.colors && item.colors.length > 0) tags.push(item.colors.join('・'));
    if(item.lightness && item.lightness !== '指定なし') tags.push(item.lightness);
    
    if(item.styles && item.styles.length > 0) {
        tags = tags.concat(item.styles.map(s => s.replace('系', '')));
    }
    return tags;
}

const routes = {
    home: {
        title: "ホーム",
        showFab: false,
        render: () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
            const dateStr = now.toLocaleDateString('ja-JP', {month: 'short', day: 'numeric', weekday: 'short'});
            
            const todayWeather = weeklyOutfits[0];
            
            let html = `
            <div style="text-align:center; margin-bottom:24px;">
                <div id="realtime-clock" class="clock-widget">${timeStr}</div>
                <div id="realtime-date" class="date-widget">${dateStr}</div>
                <div class="weather-widget" style="justify-content:center; margin-bottom:0;">
                    <i data-lucide="${todayWeather.icon}" class="weather-icon ${todayWeather.icon === 'loader' ? 'spinner' : ''}" style="width:36px; height:36px;"></i>
                    <div class="weather-info" style="text-align:left;">
                        <h2 style="font-size:1.5rem;">${todayWeather.temp}</h2>
                        <p style="margin-top:0;">東京 / ${todayWeather.condition}</p>
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
            
            html += `
            </div>
            
            <h3 class="section-title mt-4">コーデ検証ルーム（お遊び）</h3>
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
                <button class="btn-outline mt-4" onclick="analyzeCoordination()">この組み合わせを分析する</button>
                <div id="coord-result" class="hidden mt-4" style="background:var(--primary-light); padding:16px; border-radius:8px; font-size:0.9rem; line-height:1.5;"></div>
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
            if(!isDataLoaded) {
                return `<p class="text-center" style="margin-top:40px;"><i data-lucide="loader" class="spinner inline-icon"></i> 読み込み中...</p>`;
            }
            const filtered = getFilteredItems();
            let html = '';
            
            const filterCount = Object.values(activeFilters).reduce((acc, arr) => acc + arr.length, 0);
            if(filterCount > 0) {
                html += `<p style="font-size:0.8rem; color:var(--primary-color); margin-bottom:12px; font-weight:bold;">${filterCount}つのフィルター適用中</p>`;
            }

            if (filtered.length === 0) {
                html += `<p class="text-center" style="color: var(--text-secondary); margin-top: 40px;"><i data-lucide="package-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px;"></i><br>衣類が見つかりません。<br>右下の＋ボタンから追加してください。</p>`;
            } else {
                html += `<div class="closet-grid">
                    ${filtered.map(item => {
                        const tags = formatTags(item);
                        return `
                        <div class="closet-item" data-id="${item.id}" onclick="handleClosetItemClick('${item.id}')">
                            <img src="${item.image}">
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
            if(!isDataLoaded) {
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
                        <img src="${h.image}" style="width:80px; height:80px; border-radius:8px; object-fit:cover;">
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
        render: () => `
            <div class="card">
                <h3 class="section-title">テーマカラー</h3>
                <div class="theme-selector">
                    <button class="theme-btn active" onclick="setTheme('morning')">爽やか</button>
                    <button class="theme-btn" onclick="setTheme('sunset')">夕焼け</button>
                    <button class="theme-btn" onclick="setTheme('night')">ダーク</button>
                </div>
            </div>
            <div class="card mt-4">
                <h3 class="section-title">外部連携</h3>
                ${isCalendarConnected ? `
                    <div style="display:flex; align-items:center; gap:8px; padding:12px; background:var(--primary-light); border-radius:8px; color:var(--primary-color);">
                        <i data-lucide="check-circle" class="inline-icon"></i> Googleカレンダー連携済み
                    </div>
                ` : `
                    <button class="btn-google" onclick="connectGoogleCalendar()">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="G" style="width:18px;">
                        Googleカレンダーと連携
                    </button>
                    <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:8px;">予定情報を取得して1週間のコーデ提案に反映します。</p>
                `}
            </div>
            <div style="text-align:center; margin-top:32px;">
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:8px;">ログイン中のアカウント: ${currentUser ? (currentUser.email || 'Google アカウント') : ''}</p>
                <button onclick="logout()" style="background:transparent; color:#ef4444; border:1px solid #ef4444; padding:8px 16px; border-radius:20px; font-weight:bold; cursor:pointer;">ログアウト</button>
            </div>
        `
    }
};

navButtons.forEach(btn => { btn.addEventListener('click', () => { navigate(btn.getAttribute('data-target')); }); });

function navigate(route) {
    if (currentRoute === 'closet' && isEditMode) toggleEditMode();
    navButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-target="${route}"]`).classList.add('active');
    
    currentRoute = route;
    const view = routes[route];
    headerTitle.textContent = view.title;
    headerActions.innerHTML = view.headerAction || '';
    
    if(route === 'closet') {
        const btn = document.getElementById('btn-edit-closet');
        if(btn) btn.addEventListener('click', toggleEditMode);
    }
    
    mainContent.style.opacity = '0';
    setTimeout(() => {
        mainContent.innerHTML = view.render();
        lucide.createIcons();
        if (view.showFab) fabAdd.classList.remove('hidden');
        else fabAdd.classList.add('hidden');
        mainContent.style.opacity = '1';
        if(route === 'settings') updateThemeButtons();
    }, 150);
}

// 着用履歴
window.saveToHistory = async function(index) {
    if(!currentUser) return;
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
        wearHistory.unshift({ id: docRef.id, userId: currentUser.uid, title: outfit.title, image: outfit.image, dateStr: dateStr, createdAt: now.getTime() });
        alert("履歴に保存しました！");
    } catch (e) {
        alert("履歴の保存に失敗しました。");
        console.error(e);
    }
}

window.openOutfitDetails = function(index) {
    const outfit = weeklyOutfits[index];
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">${outfit.title}</h3>
            <img src="${outfit.image}" style="width:100%; height:240px; object-fit:cover; border-radius:12px; margin-bottom:16px;">
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
}

// クローゼット操作
window.handleClosetItemClick = function(id) {
    if(isEditMode) {
        const el = document.querySelector(`.closet-item[data-id="${id}"]`);
        if(selectedItems.has(id)) {
            selectedItems.delete(id); el.classList.remove('selected');
        } else {
            selectedItems.add(id); el.classList.add('selected');
        }
        const count = selectedItems.size;
        document.getElementById('selected-count').textContent = `${count}件選択中`;
        document.querySelector('#floating-delete-bar button').disabled = count === 0;
    } else {
        openItemDetails(id);
    }
}

window.toggleEditMode = function() {
    isEditMode = !isEditMode;
    selectedItems.clear();
    const btn = document.getElementById('btn-edit-closet');
    btn.textContent = isEditMode ? 'キャンセル' : '選択';
    document.querySelectorAll('.closet-item').forEach(el => {
        if(isEditMode) el.classList.add('selectable');
        else el.classList.remove('selectable', 'selected');
    });
    if(isEditMode) document.getElementById('floating-delete-bar').classList.remove('hidden');
    else document.getElementById('floating-delete-bar').classList.add('hidden');
}

window.deleteSelected = async function() {
    if(selectedItems.size === 0) return;
    if(confirm(`選択した${selectedItems.size}件を削除しますか？`)) {
        try {
            for (let id of selectedItems) {
                const item = closetItems.find(i => i.id === id);
                await deleteDoc(doc(db, "closetItems", id));
                try {
                    const imgRef = ref(storage, item.image);
                    await deleteObject(imgRef);
                } catch(e) {}
            }
            closetItems = closetItems.filter(item => !selectedItems.has(item.id));
            toggleEditMode();
            navigate('closet');
        } catch(e) {
            alert("削除に失敗しました。");
            console.error(e);
        }
    }
}

window.openItemDetails = function(id) {
    const item = closetItems.find(i => i.id === id);
    if(!item) return;
    const tags = formatTags(item);
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">詳細情報</h3>
            <img src="${item.image}" style="width:100%; height:200px; object-fit:cover; border-radius:12px; margin-bottom:16px;">
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
}

// フィルター
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
}
window.toggleMultiFilter = function(group, val, btnEl) {
    const arr = activeFilters[group];
    if(arr.includes(val)) { arr.splice(arr.indexOf(val), 1); btnEl.classList.remove('active'); }
    else { arr.push(val); btnEl.classList.add('active'); }
}
window.applyFilters = function() { closeModal(); navigate('closet'); }
window.clearFilters = function() { activeFilters = {category:[], subCategory:[], colors:[], styles:[], seasons:[], lightness:[]}; closeModal(); navigate('closet'); }
function getFilteredItems() {
    return closetItems.filter(item => {
        if(activeFilters.category.length > 0 && !activeFilters.category.includes(item.category)) return false;
        if(activeFilters.colors.length > 0 && !activeFilters.colors.some(c => (item.colors || []).includes(c))) return false;
        if(activeFilters.styles.length > 0 && !activeFilters.styles.some(s => (item.styles || []).includes(s))) return false;
        if(activeFilters.seasons.length > 0 && !activeFilters.seasons.some(s => (item.seasons || []).includes(s))) return false;
        return true;
    });
}

// ＋ボタン押下
fabAdd.addEventListener('click', () => {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">衣類または履物を登録</h3>
            <div id="upload-area" class="upload-area">
                <i data-lucide="camera" style="width: 32px; height: 32px; margin-bottom: 8px;"></i>
                <p>タップしてカメラ撮影<br><span style="font-size: 0.8rem; opacity: 0.8;">または画像を選択</span></p>
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
    if(e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => { currentUploadedImage = e.target.result; showAIAnalysisModal(); };
        reader.readAsDataURL(file);
    }
});

function showAIAnalysisModal() {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content text-center">
            <img src="${currentUploadedImage}" style="width:120px; height:120px; object-fit:cover; border-radius:12px; margin:0 auto 16px;">
            <i data-lucide="loader" class="spinner" style="width: 32px; height: 32px; color: var(--primary-color); margin-bottom: 12px;"></i>
            <p style="font-weight: 600;">AIが解析中...</p>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    
    setTimeout(() => {
        window.openEditForm(null, {
            image: currentUploadedImage,
            category: "トップス・アウター",
            subCategory: "Tシャツ",
            colors: ["白"],
            lightness: "指定なし",
            styles: ["カジュアル系"],
            seasons: ["夏"],
            memo: ""
        });
    }, 1500);
}

// フォーム編集・複数選択ロジック
window.openEditForm = function(existingId = null, presetData = null) {
    const isNew = existingId === null;
    let baseItem = isNew ? presetData : closetItems.find(i => i.id === existingId);
    
    // データ構造のマイグレーション（古いデータ対応）
    currentEditData = {
        image: baseItem.image,
        category: baseItem.category || "トップス・アウター",
        subCategory: baseItem.subCategory || "",
        colors: Array.isArray(baseItem.colors) ? [...baseItem.colors] : (baseItem.color ? [baseItem.color] : []),
        lightness: baseItem.lightness || "指定なし",
        styles: Array.isArray(baseItem.styles) ? [...baseItem.styles] : (baseItem.style ? [baseItem.style] : []),
        seasons: Array.isArray(baseItem.seasons) ? [...baseItem.seasons] : (baseItem.season ? [baseItem.season] : []),
        memo: baseItem.memo || ""
    };
    
    renderEditFormContent(isNew, existingId);
}

function renderEditFormContent(isNew, existingId) {
    const renderSingleBtn = (group, options) => {
        return options.map(opt => `<button type="button" class="form-btn ${currentEditData[group] === opt ? 'active' : ''}" onclick="setFormSingle('${group}', '${opt}')">${opt}</button>`).join('');
    };
    const renderMultiBtn = (group, options) => {
        return options.map(opt => `<button type="button" class="form-btn ${currentEditData[group].includes(opt) ? 'active' : ''}" onclick="toggleFormMulti('${group}', '${opt}')">${opt}</button>`).join('');
    };

    let subCatHtml = '';
    const subs = CATEGORIES[currentEditData.category];
    if (subs && subs.length > 0) {
        subCatHtml = `<div class="form-group"><label>種類</label><div class="form-btn-group">${renderSingleBtn('subCategory', subs)}</div></div>`;
    }

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">${isNew ? '詳細の確認・修正' : '情報の編集'}</h3>
            <img src="${currentEditData.image}" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:16px;">
            
            <div class="form-group"><label>カテゴリ</label>
                <div class="form-btn-group">${renderSingleBtn('category', Object.keys(CATEGORIES))}</div>
            </div>
            ${subCatHtml}
            
            <div class="form-group"><label>カラー (複数選択可)</label>
                <div class="form-btn-group">${renderMultiBtn('colors', COLORS)}</div>
                <div class="form-btn-group mt-4">${renderSingleBtn('lightness', ["指定なし", "明るい", "暗い"])}</div>
            </div>
            
            <div class="form-group"><label>スタイル (複数選択可)</label>
                <div class="form-btn-group">${renderMultiBtn('styles', STYLES)}</div>
            </div>
            <div class="form-group"><label>季節 (複数選択可)</label>
                <div class="form-btn-group">${renderMultiBtn('seasons', SEASONS)}</div>
            </div>
            
            <div class="form-group"><label>メモ</label><input type="text" id="input-memo" class="input-field" placeholder="例：ユニクロ 2023年モデル" value="${currentEditData.memo}"></div>
            
            <button id="btn-save-item" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">
                ${isNew ? 'クラウドに保存' : '変更を保存'}
            </button>
            <button onclick="closeModal()" class="btn-outline text-center">キャンセル</button>
        </div>
    `;
    lucide.createIcons();
    
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('btn-save-item').addEventListener('click', () => saveItemData(isNew, existingId));
}

window.setFormSingle = function(group, val) {
    currentEditData[group] = val;
    if(group === 'category') {
        const subs = CATEGORIES[val];
        currentEditData.subCategory = (subs && subs.length > 0) ? subs[0] : "";
    }
    // Re-render form to reflect sub-category changes
    renderEditFormContent(!currentEditData.id, currentEditData.id);
}
window.toggleFormMulti = function(group, val) {
    const arr = currentEditData[group];
    if(arr.includes(val)) arr.splice(arr.indexOf(val), 1);
    else arr.push(val);
    renderEditFormContent(!currentEditData.id, currentEditData.id);
}

async function saveItemData(isNew, existingId) {
    if(!currentUser) return;
    const btnSave = document.getElementById('btn-save-item');
    btnSave.innerHTML = `<i data-lucide="loader" class="spinner inline-icon"></i> 保存中...`;
    btnSave.disabled = true;
    lucide.createIcons();

    currentEditData.memo = document.getElementById('input-memo').value || '';
    
    try {
        if (isNew) {
            const imgRef = ref(storage, 'images/' + currentUser.uid + '/' + Date.now() + '.jpg');
            await uploadString(imgRef, currentEditData.image, 'data_url');
            const downloadURL = await getDownloadURL(imgRef);
            currentEditData.image = downloadURL;
            
            const docData = { userId: currentUser.uid, createdAt: Date.now(), ...currentEditData };
            const docRef = await addDoc(collection(db, "closetItems"), docData);
            closetItems.unshift({ id: docRef.id, ...docData });
            nativeCameraInput.value = '';
        } else {
            const targetRef = doc(db, "closetItems", existingId);
            const docData = { ...currentEditData };
            await updateDoc(targetRef, docData);
            const target = closetItems.find(i => i.id === existingId);
            Object.assign(target, docData);
        }
        closeModal();
        if(currentRoute === 'closet') { const t = currentRoute; currentRoute = ''; navigate(t); }
        else navigate('closet');
    } catch(e) {
        alert("エラーが発生しました: " + e.message);
        console.error(e);
        btnSave.textContent = isNew ? 'クラウドに保存' : '変更を保存';
        btnSave.disabled = false;
    }
}

// コーデ検証ルーム
window.openCoordPicker = function(slot) {
    currentTargetSlot = slot;
    const items = closetItems.filter(i => slot === 'トップス・アウター' ? i.category === 'トップス・アウター' : ['ボトムス', '靴'].includes(i.category));
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
            <h3 class="section-title">${slot}を選択</h3>
            <div class="closet-grid">
                ${items.map(item => `<div class="closet-item" onclick="selectForCoord('${item.id}')"><img src="${item.image}"></div>`).join('')}
            </div>
            <button onclick="closeModal()" class="btn-outline text-center mt-4">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
}
window.selectForCoord = function(id) {
    const item = closetItems.find(i => i.id === id);
    if(currentTargetSlot === 'トップス・アウター') coordState.tops = item;
    else coordState.bottoms = item;
    closeModal(); navigate('home');
}
window.clearCoord = function(slotKey) { coordState[slotKey] = null; navigate('home'); }
window.analyzeCoordination = function() {
    const resEl = document.getElementById('coord-result');
    if(!coordState.tops || !coordState.bottoms) {
        resEl.innerHTML = `<span style="color:#ef4444;"><i data-lucide="alert-circle" class="inline-icon"></i> トップスとボトムスの両方を選択してください！</span>`;
        resEl.classList.remove('hidden'); lucide.createIcons(); return;
    }
    resEl.innerHTML = `<i data-lucide="loader" class="spinner inline-icon"></i> AIが分析中...`;
    resEl.classList.remove('hidden'); lucide.createIcons();
    setTimeout(() => {
        const t = coordState.tops; const b = coordState.bottoms;
        resEl.innerHTML = `<strong>✨ AI分析結果</strong><br>「${t.subCategory||t.category}」と「${b.subCategory||b.category}」の組み合わせですね！<br><span style="font-size:0.8rem; color:var(--text-secondary);">${(t.colors||[]).join('')}色 × ${(b.colors||[]).join('')}色の色合いもバッチリです！</span>`;
    }, 1500);
}

// グローバルにエクスポート（バグ修正）
window.closeModal = function() { modalContainer.classList.add('hidden'); }
window.setTheme = function(themeName) { document.body.className = `theme-${themeName}`; localStorage.setItem('ai-closet-theme', themeName); updateThemeButtons(); };
function updateThemeButtons() {
    const currentTheme = localStorage.getItem('ai-closet-theme') || 'morning';
    const btns = document.querySelectorAll('.theme-btn');
    if(btns.length > 0) { btns.forEach(b => b.classList.remove('active')); if(currentTheme === 'morning') btns[0].classList.add('active'); else if(currentTheme === 'sunset') btns[1].classList.add('active'); else if(currentTheme === 'night') btns[2].classList.add('active'); }
}
window.connectGoogleCalendar = function() {
    if(!googleTokenClient) { alert("Google APIの準備中です。数秒後にお試しください。"); return; }
    googleTokenClient.requestAccessToken();
}
function init() {
    const savedTheme = localStorage.getItem('ai-closet-theme') || 'morning'; document.body.className = `theme-${savedTheme}`;
    mainContent.style.transition = 'opacity 0.15s ease';
    setTimeout(() => { initGoogleAuth(); }, 1000);
    fetchWeather();
    navigate('home');
    setTimeout(() => { lucide.createIcons(); }, 50);
}
init();
