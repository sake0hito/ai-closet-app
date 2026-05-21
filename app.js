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
let userCalendarEvent = null;

const mockData = {
    weather: { 
        today: { temp: "取得中...", condition: "取得中...", icon: "loader", location: "東京都" },
        tomorrow: { temp: "--°C", condition: "--", icon: "loader" }
    },
    todayOutfit: {
        title: "今日のAI提案コーデ",
        image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=400&q=80",
        tags: ["カジュアル", "春", "動きやすい"],
        reason: "今日の気温に合わせて、通気性の良いシャツとデニムの組み合わせが最適です。"
    },
    tomorrowOutfit: {
        title: "明日のAI提案コーデ",
        image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=400&q=80",
        tags: ["大人っぽい", "秋", "スマート"],
        reason: "明日は少し冷え込む予報のため、サッと羽織れるアウターを用意しました。"
    }
};

let closetItems = [];
let wearHistory = [];
let isDataLoaded = false;

let currentRoute = '';
let isEditMode = false;
let selectedItems = new Set();
let activeFilters = { category: [], season: [], style: [] };
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

// Auth State Observer
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

// Auth Handlers
document.getElementById('btn-google-login').addEventListener('click', async () => {
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch(e) { authError.textContent = "Googleログインに失敗しました: " + e.message; }
});

document.getElementById('btn-email-register').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    if(!email || !pass) { authError.textContent = "メールアドレスとパスワードを入力してください"; return; }
    try {
        await createUserWithEmailAndPassword(auth, email, pass);
    } catch(e) { authError.textContent = "登録エラー: " + e.message; }
});

document.getElementById('btn-email-login').addEventListener('click', async () => {
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

// Firebaseから自分専用データを取得
async function fetchFirebaseData() {
    if(!currentUser || isDataLoaded) return;
    try {
        // userIdが一致するものだけを取得
        const qCloset = query(collection(db, "closetItems"), where("userId", "==", currentUser.uid));
        const snapshot = await getDocs(qCloset);
        closetItems = [];
        snapshot.forEach((doc) => { closetItems.push({ id: doc.id, ...doc.data() }); });
        // JS側で降順ソート（インデックス作成エラー回避のため）
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
                        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&maxResults=1&singleEvents=true&orderBy=startTime`, {
                            headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
                        });
                        const data = await res.json();
                        if (data.items && data.items.length > 0) {
                            userCalendarEvent = data.items[0].summary;
                            mockData.todayOutfit.reason = `今日の予定「${userCalendarEvent}」と気温に合わせて、最適なコーデを選びました！`;
                        } else {
                            mockData.todayOutfit.reason = `今日は特に予定がないため、リラックスできるコーデを選びました！`;
                        }
                    } catch(e) { console.error(e); }
                    
                    alert("Googleカレンダーと連携し、直近の予定を取得しました！");
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
        
        const cw = parseWeather(data.current_weather.weathercode);
        mockData.weather.today.temp = `${Math.round(data.current_weather.temperature)}°C`;
        mockData.weather.today.condition = cw.c;
        mockData.weather.today.icon = cw.i;
        
        if (data.daily) {
            const tw = parseWeather(data.daily.weathercode[1]);
            mockData.weather.tomorrow.temp = `${Math.round(data.daily.temperature_2m_max[1])}°C`;
            mockData.weather.tomorrow.condition = tw.c;
            mockData.weather.tomorrow.icon = tw.i;
        }
        
        if (currentRoute === 'home') navigate('home');
    } catch (e) {
        mockData.weather.today.temp = "--°C"; mockData.weather.today.condition = "エラー";
    }
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

const routes = {
    home: {
        title: "ホーム",
        showFab: false,
        render: () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'});
            const dateStr = now.toLocaleDateString('ja-JP', {month: 'short', day: 'numeric', weekday: 'short'});
            
            return `
            <div style="text-align:center; margin-bottom:24px;">
                <div id="realtime-clock" class="clock-widget">${timeStr}</div>
                <div id="realtime-date" class="date-widget">${dateStr}</div>
                <div class="weather-widget" style="justify-content:center; margin-bottom:0;">
                    <i data-lucide="${mockData.weather.today.icon}" class="weather-icon ${mockData.weather.today.icon === 'loader' ? 'spinner' : ''}" style="width:36px; height:36px;"></i>
                    <div class="weather-info" style="text-align:left;">
                        <h2 style="font-size:1.5rem;">${mockData.weather.today.temp}</h2>
                        <p style="margin-top:0;">${mockData.weather.today.location} / ${mockData.weather.today.condition}</p>
                    </div>
                </div>
            </div>

            <h3 class="section-title">今日のAI提案コーデ</h3>
            <div class="card outfit-card" onclick="openOutfitDetails('today')">
                <img src="${mockData.todayOutfit.image}" alt="Outfit" class="outfit-image" />
                <div class="outfit-details">
                    <h4 class="mb-4">${mockData.todayOutfit.title}</h4>
                    <div>${mockData.todayOutfit.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
                    <p class="mt-4" style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5;">
                        <i data-lucide="sparkles" class="inline-icon" style="color: var(--accent-color); margin-right: 4px;"></i>
                        ${mockData.todayOutfit.reason}
                    </p>
                </div>
            </div>
            
            <h3 class="section-title mt-4" style="font-size:0.95rem;">明日のAI提案コーデ <span style="font-size:0.8rem; font-weight:normal; color:var(--text-secondary);"><i data-lucide="${mockData.weather.tomorrow.icon}" class="inline-icon"></i> ${mockData.weather.tomorrow.temp}</span></h3>
            <div class="card outfit-card small" onclick="openOutfitDetails('tomorrow')">
                <img src="${mockData.tomorrowOutfit.image}" alt="Outfit" class="outfit-image" />
                <div class="outfit-details">
                    <h4>${mockData.tomorrowOutfit.title}</h4>
                    <p style="color: var(--text-secondary); line-height: 1.4;">
                        <i data-lucide="calendar" class="inline-icon" style="color: var(--accent-color);"></i>
                        ${mockData.tomorrowOutfit.reason}
                    </p>
                </div>
            </div>

            <h3 class="section-title mt-4">コーデ検証ルーム（お遊び）</h3>
            <div class="card">
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">手持ちの衣類を組み合わせてAIの評価を聞いてみよう！枠をタップして衣類を選択してください。</p>
                <div class="coord-slots">
                    <div class="coord-slot" onclick="openCoordPicker('トップス')" id="slot-tops">
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
            
            const filterCount = activeFilters.category.length + activeFilters.season.length + activeFilters.style.length;
            if(filterCount > 0) {
                html += `<p style="font-size:0.8rem; color:var(--primary-color); margin-bottom:12px; font-weight:bold;">${filterCount}つのフィルター適用中</p>`;
            }

            if (filtered.length === 0) {
                html += `<p class="text-center" style="color: var(--text-secondary); margin-top: 40px;"><i data-lucide="package-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px;"></i><br>該当する衣類・履物が見つかりません。<br>右下の＋ボタンから追加してください。</p>`;
            } else {
                html += `<div class="closet-grid">
                    ${filtered.map(item => `
                        <div class="closet-item" data-id="${item.id}" onclick="handleClosetItemClick('${item.id}')">
                            <img src="${item.image}">
                            <div class="item-tags">
                                <span class="tag-small">${item.category}</span>
                            </div>
                        </div>
                    `).join('')}
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
                html += `<p style="color: var(--text-secondary); font-size: 0.9rem;">まだ履歴がありません。<br>ホーム画面の「今日着た！」ボタンを押すとここに記録されます。</p>`;
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
                        <i data-lucide="check-circle" class="inline-icon"></i> Google連携済み
                        ${userCalendarEvent ? `<br><span style="font-size:0.8rem; margin-left:24px;">直近の予定: ${userCalendarEvent}</span>` : ''}
                    </div>
                ` : `
                    <button class="btn-google" onclick="connectGoogleCalendar()">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="G" style="width:18px;">
                        Googleカレンダーと連携
                    </button>
                    <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:8px;">予定情報を取得してコーデ提案に反映します。</p>
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

// 着用履歴への登録
window.saveToHistory = async function(type) {
    if(!currentUser) return;
    const outfit = type === 'today' ? mockData.todayOutfit : mockData.tomorrowOutfit;
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

window.openOutfitDetails = function(type) {
    const outfit = type === 'today' ? mockData.todayOutfit : mockData.tomorrowOutfit;
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
            <button onclick="saveToHistory('${type}')" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">
                今日着た！履歴に残す
            </button>
            <button id="close-modal" class="btn-outline text-center">閉じる</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('close-modal').addEventListener('click', closeModal);
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
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">詳細情報</h3>
            <img src="${item.image}" style="width:100%; height:200px; object-fit:cover; border-radius:12px; margin-bottom:16px;">
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;">
                <span class="tag">${item.category}</span>
                <span class="tag">${item.color}</span>
                <span class="tag">${item.style}</span>
                <span class="tag">${item.season}</span>
            </div>
            ${item.memo ? `<p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:16px;">${item.memo}</p>` : ''}
            
            <button onclick="openEditForm('${item.id}')" style="width:100%; background:var(--surface-solid); color:var(--primary-color); border:2px solid var(--primary-color); padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">編集する</button>
            <button id="close-modal" class="btn-outline text-center">閉じる</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('close-modal').addEventListener('click', closeModal);
}

// フィルター
window.openFilterModal = function() {
    const renderBtns = (group, options) => options.map(opt => 
        `<button class="filter-btn ${activeFilters[group].includes(opt) ? 'active' : ''}" onclick="toggleFilter('${group}', '${opt}', this)">${opt}</button>`
    ).join('');

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">絞り込み</h3>
            <div class="form-group"><label>カテゴリ</label><div class="filter-btn-group">${renderBtns('category', ['トップス','ボトムス','アウター','ワンピース','シューズ'])}</div></div>
            <div class="form-group"><label>スタイル</label><div class="filter-btn-group">${renderBtns('style', ['カジュアル','大人っぽい','フォーマル','スポーティ'])}</div></div>
            <div class="form-group"><label>季節</label><div class="filter-btn-group">${renderBtns('season', ['春','夏','秋','冬','オールシーズン'])}</div></div>
            <button onclick="applyFilters()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">適用する</button>
            <button onclick="clearFilters()" class="btn-outline text-center text-danger">条件をクリア</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
}
window.toggleFilter = function(group, val, btnEl) {
    const arr = activeFilters[group];
    if(arr.includes(val)) { arr.splice(arr.indexOf(val), 1); btnEl.classList.remove('active'); }
    else { arr.push(val); btnEl.classList.add('active'); }
}
window.applyFilters = function() { closeModal(); navigate('closet'); }
window.clearFilters = function() { activeFilters = {category:[], season:[], style:[]}; closeModal(); navigate('closet'); }
function getFilteredItems() {
    return closetItems.filter(item => {
        if(activeFilters.category.length > 0 && !activeFilters.category.includes(item.category)) return false;
        if(activeFilters.style.length > 0 && !activeFilters.style.includes(item.style)) return false;
        if(activeFilters.season.length > 0) {
            const hasMatch = activeFilters.season.some(s => item.season.includes(s));
            if(!hasMatch) return false;
        }
        return true;
    });
}

// 着せ替え
window.openCoordPicker = function(slot) {
    currentTargetSlot = slot;
    const items = closetItems.filter(i => slot === 'トップス' ? ['トップス','アウター'].includes(i.category) : ['ボトムス','シューズ'].includes(i.category));
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
            <h3 class="section-title">${slot}を選択</h3>
            <div class="closet-grid">
                ${items.map(item => `<div class="closet-item" onclick="selectForCoord('${item.id}')"><img src="${item.image}"></div>`).join('')}
            </div>
            <button id="close-modal" class="btn-outline text-center mt-4">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('close-modal').addEventListener('click', closeModal);
}
window.selectForCoord = function(id) {
    const item = closetItems.find(i => i.id === id);
    if(currentTargetSlot === 'トップス') coordState.tops = item;
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
        let evaluation = "良い組み合わせですね！";
        if(t.style === b.style) evaluation = `全身を「${t.style}」で統一した素晴らしいコーディネートです。`;
        else evaluation = `「${t.style}」と「${b.style}」をミックスした上級者向けの着こなしです。`;
        resEl.innerHTML = `<strong>✨ AI分析結果</strong><br>${evaluation}<br><span style="font-size:0.8rem; color:var(--text-secondary);">${t.color} × ${b.color} の色合いもバッチリです！</span>`;
    }, 1500);
}

// ＋ボタン押下
fabAdd.addEventListener('click', () => {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">衣類または履物を登録</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:16px;">
                ※正確なAI判定のため、自動車や動物などのオブジェクトが写っていない画像をご使用ください。
            </p>
            <div id="upload-area" class="upload-area">
                <i data-lucide="camera" style="width: 32px; height: 32px; margin-bottom: 8px;"></i>
                <p>タップしてカメラ撮影<br><span style="font-size: 0.8rem; opacity: 0.8;">または画像を選択</span></p>
            </div>
            <button id="close-modal" class="btn-outline mt-4 text-center">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('close-modal').addEventListener('click', closeModal);
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
        if (Math.random() < 0.2) {
            modalContainer.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-content text-center">
                    <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                    <h3 style="color:#ef4444; font-weight:bold; margin-bottom:8px;">登録エラー</h3>
                    <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:24px;">自動車や動物、風景など、衣類・履物以外のオブジェクトが検出されました。<br>衣類・履物がメインに写った画像をご使用ください。</p>
                    <button onclick="closeModal()" class="btn-outline text-center">閉じる</button>
                </div>
            `;
            lucide.createIcons();
            return;
        }
        
        const categories = ["トップス", "ボトムス", "アウター", "シューズ"];
        const styles = ["カジュアル", "大人っぽい", "スポーティ"];
        const seasons = ["春", "夏", "秋", "冬", "オールシーズン"];
        const colors = ["黒", "白", "ブルー", "ベージュ"];
        
        window.openEditForm(null, {
            image: currentUploadedImage,
            category: categories[Math.floor(Math.random() * categories.length)],
            style: styles[Math.floor(Math.random() * styles.length)],
            season: seasons[Math.floor(Math.random() * seasons.length)],
            color: colors[Math.floor(Math.random() * colors.length)],
            memo: ""
        });
    }, 2000);
}

window.openEditForm = function(existingId = null, presetData = null) {
    const isNew = existingId === null;
    const item = isNew ? presetData : closetItems.find(i => i.id === existingId);
    currentEditData = { ...item };
    
    const renderFormBtns = (group, options) => {
        return options.map(opt => `
            <button type="button" class="form-btn ${currentEditData[group] === opt ? 'active' : ''}" 
                    onclick="setFormData('${group}', '${opt}', this)">${opt}</button>
        `).join('');
    };

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">${isNew ? '詳細の確認・修正' : '情報の編集'}</h3>
            <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:12px;">${isNew ? 'AIの解析結果を選択しています。間違っている場合は修正してください。' : ''}</p>
            <img src="${item.image}" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:16px;">
            
            <div class="form-group"><label>カテゴリ</label>
                <div class="form-btn-group">${renderFormBtns('category', ["トップス", "ボトムス", "アウター", "ワンピース", "シューズ"])}</div>
            </div>
            <div class="form-group"><label>スタイル</label>
                <div class="form-btn-group">${renderFormBtns('style', ["カジュアル", "大人っぽい", "フォーマル", "スポーティ"])}</div>
            </div>
            <div class="form-group"><label>季節</label>
                <div class="form-btn-group">${renderFormBtns('season', ["春", "夏", "秋", "冬", "オールシーズン"])}</div>
            </div>
            
            <div class="form-group"><label>メインカラー</label><input type="text" id="input-color" class="input-field" value="${item.color}"></div>
            <div class="form-group"><label>メモ</label><input type="text" id="input-memo" class="input-field" placeholder="例：ユニクロ 2023年モデル" value="${item.memo}"></div>
            
            <button id="btn-save-item" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px; cursor:pointer;">
                ${isNew ? 'クラウドに保存' : '変更を保存'}
            </button>
            <button id="btn-cancel-item" class="btn-outline text-center">キャンセル</button>
        </div>
    `;
    lucide.createIcons();
    
    document.getElementById('btn-cancel-item').addEventListener('click', closeModal);
    document.getElementById('btn-save-item').addEventListener('click', async () => {
        if(!currentUser) return;
        const btnSave = document.getElementById('btn-save-item');
        btnSave.innerHTML = `<i data-lucide="loader" class="spinner inline-icon"></i> 保存中...`;
        btnSave.disabled = true;
        lucide.createIcons();

        currentEditData.color = document.getElementById('input-color').value || '未設定';
        currentEditData.memo = document.getElementById('input-memo').value || '';
        
        try {
            if (isNew) {
                const imgRef = ref(storage, 'images/' + currentUser.uid + '/' + Date.now() + '.jpg');
                await uploadString(imgRef, currentEditData.image, 'data_url');
                const downloadURL = await getDownloadURL(imgRef);
                
                const docRef = await addDoc(collection(db, "closetItems"), {
                    userId: currentUser.uid,
                    image: downloadURL,
                    category: currentEditData.category,
                    color: currentEditData.color,
                    style: currentEditData.style,
                    season: currentEditData.season,
                    memo: currentEditData.memo,
                    createdAt: Date.now()
                });
                closetItems.unshift({ id: docRef.id, userId: currentUser.uid, image: downloadURL, category: currentEditData.category, color: currentEditData.color, style: currentEditData.style, season: currentEditData.season, memo: currentEditData.memo });
                nativeCameraInput.value = '';
            } else {
                const targetRef = doc(db, "closetItems", existingId);
                await updateDoc(targetRef, {
                    category: currentEditData.category,
                    color: currentEditData.color,
                    style: currentEditData.style,
                    season: currentEditData.season,
                    memo: currentEditData.memo
                });
                const target = closetItems.find(i => i.id === existingId);
                Object.assign(target, currentEditData);
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
    });
}

window.setFormData = function(group, val, btnEl) {
    currentEditData[group] = val;
    btnEl.parentElement.querySelectorAll('.form-btn').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
}

function closeModal() { modalContainer.classList.add('hidden'); }
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
    window.openEditForm = window.openEditForm; 
    const savedTheme = localStorage.getItem('ai-closet-theme') || 'morning'; document.body.className = `theme-${savedTheme}`;
    mainContent.style.transition = 'opacity 0.15s ease';
    setTimeout(() => { initGoogleAuth(); }, 1000);
    fetchWeather();
    navigate('home');
    setTimeout(() => { lucide.createIcons(); }, 50);
}
init();
