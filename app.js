const GOOGLE_CLIENT_ID = "129220662304-ep6hsfq62ftri0kcirnv647sbnt0gk73.apps.googleusercontent.com";
let googleTokenClient;
let isCalendarConnected = false;

const mockData = {
    weather: { temp: "取得中...", condition: "取得中...", icon: "loader", location: "東京都" },
    todayOutfit: {
        title: "大学・カフェ向け爽やかコーデ",
        image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=400&q=80",
        tags: ["カジュアル", "春", "動きやすい"],
        reason: "今日は暖かく晴れるため、通気性の良いシャツとデニムの組み合わせが最適です。"
    }
};

let closetItems = [
    { id: 1, image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=300&q=80", category: "トップス", color: "白" },
    { id: 2, image: "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=300&q=80", category: "ボトムス", color: "ブルー" }
];
let currentRoute = '';
let isEditMode = false;
let selectedItems = new Set();

const mainContent = document.getElementById('main-content');
const headerTitle = document.getElementById('header-title');
const headerActions = document.getElementById('header-actions');
const navButtons = document.querySelectorAll('.nav-btn');
const fabAdd = document.getElementById('fab-add');
const modalContainer = document.getElementById('modal-container');
const nativeCameraInput = document.getElementById('native-camera-input');

// Google OAuth 初期化
function initGoogleAuth() {
    if (window.google) {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/calendar.readonly',
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    isCalendarConnected = true;
                    alert("Googleカレンダーと連携しました！\n（プロトタイプのため権限取得のみ）");
                    if (currentRoute === 'settings') navigate('settings'); // 再描画
                }
            },
        });
    }
}

async function fetchWeather() {
    try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current_weather=true&timezone=Asia%2FTokyo');
        const data = await response.json();
        const current = data.current_weather;
        let condition = "晴れ"; let icon = "sun";
        if (current.weathercode >= 1 && current.weathercode <= 3) { condition = "曇り"; icon = "cloud"; }
        else if (current.weathercode >= 45 && current.weathercode <= 48) { condition = "霧"; icon = "cloud-fog"; }
        else if (current.weathercode >= 51 && current.weathercode <= 67) { condition = "雨"; icon = "cloud-rain"; }
        else if (current.weathercode >= 71) { condition = "雪"; icon = "snowflake"; }
        
        mockData.weather.temp = `${Math.round(current.temperature)}°C`;
        mockData.weather.condition = condition;
        mockData.weather.icon = icon;
        
        if (currentRoute === 'home') {
            const weatherWidget = document.querySelector('.weather-widget');
            if (weatherWidget) {
                weatherWidget.innerHTML = `<i data-lucide="${icon}" class="weather-icon"></i><div class="weather-info"><h2>${mockData.weather.temp}</h2><p>${mockData.weather.location} / ${mockData.weather.condition}</p></div>`;
                lucide.createIcons();
            }
        }
    } catch (e) {
        mockData.weather.temp = "--°C"; mockData.weather.condition = "エラー";
    }
}

const routes = {
    home: {
        title: "ホーム",
        showFab: false,
        render: () => `
            <div class="weather-widget">
                <i data-lucide="${mockData.weather.icon}" class="weather-icon ${mockData.weather.icon === 'loader' ? 'spinner' : ''}"></i>
                <div class="weather-info">
                    <h2>${mockData.weather.temp}</h2>
                    <p>${mockData.weather.location} / ${mockData.weather.condition}</p>
                </div>
            </div>
            <h3 class="section-title">今日のAI提案コーデ</h3>
            <div class="card outfit-card">
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
        `
    },
    closet: {
        title: "クローゼット",
        showFab: true,
        headerAction: '<button id="btn-edit-closet" style="background:none; border:none; color:var(--primary-color); font-weight:600; font-size:0.9rem;">編集</button>',
        render: () => {
            if (closetItems.length === 0) {
                return `<p class="text-center" style="color: var(--text-secondary); margin-top: 40px;"><i data-lucide="package-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px;"></i><br>服のデータがありません。<br>右下の＋ボタンから追加してください。</p>`;
            }
            return `
                <div class="closet-grid">
                    ${closetItems.map(item => `
                        <div class="closet-item" data-id="${item.id}" onclick="toggleSelect(${item.id})">
                            <img src="${item.image}" alt="${item.category}">
                            <div class="item-tags">
                                <span class="tag-small">${item.category}</span>
                                <span class="tag-small">${item.color}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div id="floating-delete-bar" class="floating-action-bar hidden">
                    <span id="selected-count">0件選択中</span>
                    <button onclick="deleteSelected()" style="background:white; color:#ef4444; border:none; padding:8px 16px; border-radius:16px; font-weight:bold;">削除</button>
                </div>
            `;
        }
    },
    history: {
        title: "着用履歴",
        showFab: false,
        render: () => `<div class="card"><h3 class="section-title">今週の履歴</h3><p style="color: var(--text-secondary); font-size: 0.9rem;">まだ履歴がありません。</p></div>`
    },
    settings: {
        title: "設定",
        showFab: false,
        render: () => `
            <div class="card">
                <h3 class="section-title">テーマカラー</h3>
                <div class="theme-selector">
                    <button class="theme-btn active" onclick="setTheme('morning')">爽やか（朝）</button>
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
                        <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="G">
                        Googleカレンダーと連携
                    </button>
                    <p style="font-size:0.75rem; color:var(--text-secondary); margin-top:8px;">予定に合わせたコーデを提案するために連携します。</p>
                `}
            </div>

            <div class="card mt-4">
                <h3 class="section-title">アカウント設定</h3>
                <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:12px;">※プロトタイプのため連携は行われません</p>
                <div class="setting-row">
                    <span><i data-lucide="fingerprint" class="inline-icon"></i> 生体認証ログイン</span>
                    <label class="toggle-switch">
                        <input type="checkbox" checked>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        `
    }
};

navButtons.forEach(btn => { btn.addEventListener('click', () => { navigate(btn.getAttribute('data-target')); }); });

function navigate(route) {
    if (currentRoute === 'closet' && isEditMode) toggleEditMode(); // 編集モード解除
    
    navButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-target="${route}"]`).classList.add('active');
    
    currentRoute = route;
    const view = routes[route];
    
    headerTitle.textContent = view.title;
    headerActions.innerHTML = view.headerAction || '';
    if(route === 'closet') {
        document.getElementById('btn-edit-closet').addEventListener('click', toggleEditMode);
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

// クローゼットの編集モード
window.toggleEditMode = function() {
    isEditMode = !isEditMode;
    selectedItems.clear();
    const btn = document.getElementById('btn-edit-closet');
    btn.textContent = isEditMode ? '完了' : '編集';
    
    document.querySelectorAll('.closet-item').forEach(el => {
        if(isEditMode) el.classList.add('selectable');
        else { el.classList.remove('selectable', 'selected'); }
    });
    
    if(isEditMode) document.getElementById('floating-delete-bar').classList.remove('hidden');
    else document.getElementById('floating-delete-bar').classList.add('hidden');
    
    updateDeleteBar();
}

window.toggleSelect = function(id) {
    if(!isEditMode) return;
    const el = document.querySelector(`.closet-item[data-id="${id}"]`);
    if(selectedItems.has(id)) {
        selectedItems.delete(id);
        el.classList.remove('selected');
    } else {
        selectedItems.add(id);
        el.classList.add('selected');
    }
    updateDeleteBar();
}

function updateDeleteBar() {
    if(!isEditMode) return;
    const count = selectedItems.size;
    document.getElementById('selected-count').textContent = `${count}件選択中`;
    const delBtn = document.querySelector('#floating-delete-bar button');
    delBtn.style.opacity = count > 0 ? '1' : '0.5';
    delBtn.disabled = count === 0;
}

window.deleteSelected = function() {
    if(selectedItems.size === 0) return;
    if(confirm(`選択した${selectedItems.size}着を削除しますか？`)) {
        closetItems = closetItems.filter(item => !selectedItems.has(item.id));
        toggleEditMode(); // 編集モード終了
        const tempRoute = currentRoute; currentRoute = ''; navigate(tempRoute); // 再描画
    }
}

// Google カレンダー連携
window.connectGoogleCalendar = function() {
    if(!googleTokenClient) {
        alert("Google APIの準備中です。数秒後にもう一度お試しください。");
        return;
    }
    // GIS OAuth フロー開始
    googleTokenClient.requestAccessToken();
}

// カメラ・写真登録のフロー
fabAdd.addEventListener('click', () => {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">カメラと写真へのアクセス</h3>
            <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:20px;">
                服を登録するために、カメラまたは写真ライブラリを起動します。<br>
                ※写真のデータはAI解析用としてブラウザ内のみで処理されます。
            </p>
            <button id="btn-trigger-camera" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px;">
                <i data-lucide="camera" class="inline-icon"></i> 許可して起動する
            </button>
            <button id="close-modal" class="btn-outline text-center">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('close-modal').addEventListener('click', closeModal);
    
    document.getElementById('btn-trigger-camera').addEventListener('click', () => {
        closeModal();
        nativeCameraInput.click(); // ネイティブのファイル選択（カメラ起動）をトリガー
    });
});

let currentUploadedImage = null;

// 画像が選択された（撮影された）時の処理
nativeCameraInput.addEventListener('change', (e) => {
    if(e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            currentUploadedImage = e.target.result;
            showAIAnalysisModal();
        };
        reader.readAsDataURL(file);
    }
});

function showAIAnalysisModal() {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content text-center">
            <img src="${currentUploadedImage}" style="width:120px; height:120px; object-fit:cover; border-radius:12px; margin:0 auto 16px;">
            <i data-lucide="loader" class="spinner" style="width: 32px; height: 32px; color: var(--primary-color); margin-bottom: 12px;"></i>
            <p style="font-weight: 600;">AIが服を解析中...</p>
            <p style="font-size: 0.8rem; color: var(--text-secondary);">カテゴリ・色・季節を判定しています</p>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    
    // 2秒後に詳細入力画面へ
    setTimeout(() => {
        showEditDetailsModal();
    }, 2000);
}

function showEditDetailsModal() {
    // AIの推測結果のモック
    const aiCategory = "トップス";
    const aiColor = "黒";
    const aiSeason = "春, 秋";

    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">服の詳細情報</h3>
            <img src="${currentUploadedImage}" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:16px;">
            
            <div class="form-group">
                <label>カテゴリ</label>
                <input type="text" id="input-category" class="input-field" value="${aiCategory}">
            </div>
            <div class="form-group">
                <label>メインカラー</label>
                <input type="text" id="input-color" class="input-field" value="${aiColor}">
            </div>
            <div class="form-group">
                <label>シーズン</label>
                <input type="text" id="input-season" class="input-field" value="${aiSeason}">
            </div>
            <div class="form-group">
                <label>メモ（ブランドや購入日など）</label>
                <input type="text" id="input-memo" class="input-field" placeholder="例：ユニクロ 2023年モデル">
            </div>
            
            <button id="btn-save-item" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px;">
                クローゼットに登録
            </button>
            <button id="btn-cancel-item" class="btn-outline text-center">キャンセル</button>
        </div>
    `;
    lucide.createIcons();
    
    document.getElementById('btn-cancel-item').addEventListener('click', closeModal);
    document.getElementById('btn-save-item').addEventListener('click', () => {
        const cat = document.getElementById('input-category').value;
        const col = document.getElementById('input-color').value;
        
        closetItems.push({
            id: Date.now(),
            image: currentUploadedImage,
            category: cat || '未分類',
            color: col || '未設定'
        });
        
        closeModal();
        nativeCameraInput.value = ''; // Reset input
        if(currentRoute === 'closet') {
            const temp = currentRoute; currentRoute = ''; navigate(temp);
        } else {
            navigate('closet');
        }
    });
}

function closeModal() { modalContainer.classList.add('hidden'); }

window.setTheme = function(themeName) {
    document.body.className = `theme-${themeName}`;
    localStorage.setItem('ai-closet-theme', themeName);
    updateThemeButtons();
};

function updateThemeButtons() {
    const currentTheme = localStorage.getItem('ai-closet-theme') || 'morning';
    const btns = document.querySelectorAll('.theme-btn');
    if(btns.length === 0) return;
    btns.forEach(btn => btn.classList.remove('active'));
    if(currentTheme === 'morning') btns[0].classList.add('active');
    if(currentTheme === 'sunset') btns[1].classList.add('active');
    if(currentTheme === 'night') btns[2].classList.add('active');
}

function init() {
    const savedTheme = localStorage.getItem('ai-closet-theme') || 'morning';
    document.body.className = `theme-${savedTheme}`;
    mainContent.style.transition = 'opacity 0.15s ease';
    
    setTimeout(() => { initGoogleAuth(); }, 1000); // GISの読み込みを待つ
    
    fetchWeather();
    navigate('home');
    setTimeout(() => { lucide.createIcons(); }, 50);
}

init();
