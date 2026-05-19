const GOOGLE_CLIENT_ID = "129220662304-ep6hsfq62ftri0kcirnv647sbnt0gk73.apps.googleusercontent.com";
let googleTokenClient;
let isCalendarConnected = false;

const mockData = {
    weather: { temp: "取得中...", condition: "取得中...", icon: "loader", location: "東京都" }
};

let closetItems = [
    { id: 1, image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=300&q=80", category: "トップス", color: "白", season: "春, 夏", style: "カジュアル", memo: "" },
    { id: 2, image: "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=300&q=80", category: "ボトムス", color: "ブルー", season: "オールシーズン", style: "カジュアル", memo: "" },
    { id: 3, image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=300&q=80", category: "アウター", color: "黒", season: "秋, 冬", style: "大人っぽい", memo: "" }
];

let currentRoute = '';
let isEditMode = false;
let selectedItems = new Set();
let activeFilters = { category: [], season: [], style: [] };
let coordState = { tops: null, bottoms: null };
let currentTargetSlot = null; // for picker

const mainContent = document.getElementById('main-content');
const headerTitle = document.getElementById('header-title');
const headerActions = document.getElementById('header-actions');
const navButtons = document.querySelectorAll('.nav-btn');
const fabAdd = document.getElementById('fab-add');
const modalContainer = document.getElementById('modal-container');
const nativeCameraInput = document.getElementById('native-camera-input');

function initGoogleAuth() {
    if (window.google) {
        googleTokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/calendar.readonly',
            callback: (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    isCalendarConnected = true;
                    alert("Googleカレンダーと連携しました！");
                    if (currentRoute === 'settings') navigate('settings');
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
        if (currentRoute === 'home') navigate('home');
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

            <h3 class="section-title">コーデ検証ルーム（お遊び）</h3>
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
        `
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
            const filtered = getFilteredItems();
            let html = '';
            
            // 現在のフィルター状態表示
            const filterCount = activeFilters.category.length + activeFilters.season.length + activeFilters.style.length;
            if(filterCount > 0) {
                html += `<p style="font-size:0.8rem; color:var(--primary-color); margin-bottom:12px; font-weight:bold;">${filterCount}つのフィルター適用中</p>`;
            }

            if (filtered.length === 0) {
                html += `<p class="text-center" style="color: var(--text-secondary); margin-top: 40px;"><i data-lucide="package-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px;"></i><br>該当する衣類・履物がありません。<br>右下の＋ボタンから追加してください。</p>`;
            } else {
                html += `<div class="closet-grid">
                    ${filtered.map(item => `
                        <div class="closet-item" data-id="${item.id}" onclick="handleClosetItemClick(${item.id})">
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
                    <button onclick="deleteSelected()" style="background:white; color:#ef4444; border:none; padding:8px 16px; border-radius:16px; font-weight:bold;">削除</button>
                </div>
            `;
            return html;
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
                    </div>
                ` : `
                    <button class="btn-google" onclick="connectGoogleCalendar()">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="G">
                        Googleカレンダーと連携
                    </button>
                `}
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

// クローゼット操作ロジック
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

window.deleteSelected = function() {
    if(selectedItems.size === 0) return;
    if(confirm(`選択した${selectedItems.size}着を削除しますか？`)) {
        closetItems = closetItems.filter(item => !selectedItems.has(item.id));
        toggleEditMode();
        navigate('closet');
    }
}

// 詳細と編集（既存アイテム用）
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
            
            <button onclick="openEditForm(${item.id})" style="width:100%; background:var(--surface-solid); color:var(--primary-color); border:2px solid var(--primary-color); padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px;">編集する</button>
            <button id="close-modal" class="btn-outline text-center">閉じる</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('close-modal').addEventListener('click', closeModal);
}

// フィルターロジック
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
            <button onclick="applyFilters()" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px;">適用する</button>
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
            // seasonはカンマ区切り文字列の可能性を考慮
            const hasMatch = activeFilters.season.some(s => item.season.includes(s));
            if(!hasMatch) return false;
        }
        return true;
    });
}

// 着せ替え検証ロジック
window.openCoordPicker = function(slot) {
    currentTargetSlot = slot;
    const items = closetItems.filter(i => slot === 'トップス' ? ['トップス','アウター'].includes(i.category) : ['ボトムス','シューズ'].includes(i.category));
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content" style="max-height:80vh; overflow-y:auto;">
            <h3 class="section-title">${slot}を選択</h3>
            <div class="closet-grid">
                ${items.map(item => `<div class="closet-item" onclick="selectForCoord(${item.id})"><img src="${item.image}"></div>`).join('')}
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

// ＋ボタン押下〜新規登録フロー
fabAdd.addEventListener('click', () => {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">衣類または履物を登録</h3>
            <p style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:16px;">
                ※正確なAI判定のため、衣類または履物が「中心に1つだけ」写った画像をご使用ください。<br>自動車や風景などは登録できません。
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
            <p style="font-weight: 600;">AIが衣類を解析中...</p>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    
    setTimeout(() => {
        // 20%の確率でモックエラー発生（衣類以外を検出）
        if (Math.random() < 0.2) {
            modalContainer.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-content text-center">
                    <i data-lucide="alert-triangle" style="width: 48px; height: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                    <h3 style="color:#ef4444; font-weight:bold; margin-bottom:8px;">登録エラー</h3>
                    <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:24px;">自動車や風景など、衣類または履物ではないオブジェクトが検出されました。<br>※衣類・履物が中心に1つだけ写った画像をご使用ください。</p>
                    <button onclick="closeModal()" class="btn-outline text-center">閉じる</button>
                </div>
            `;
            lucide.createIcons();
            return;
        }
        // 成功時は自動入力用のランダム初期値を生成して編集画面へ
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
    
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">${isNew ? '詳細の確認・修正' : '情報の編集'}</h3>
            <img src="${item.image}" style="width:100%; height:160px; object-fit:cover; border-radius:12px; margin-bottom:16px;">
            <div class="form-group"><label>カテゴリ</label><input type="text" id="input-category" class="input-field" value="${item.category}"></div>
            <div class="form-group"><label>メインカラー</label><input type="text" id="input-color" class="input-field" value="${item.color}"></div>
            <div class="form-group"><label>スタイル</label><input type="text" id="input-style" class="input-field" value="${item.style}"></div>
            <div class="form-group"><label>季節</label><input type="text" id="input-season" class="input-field" value="${item.season}"></div>
            <div class="form-group"><label>メモ</label><input type="text" id="input-memo" class="input-field" placeholder="例：ユニクロ 2023年モデル" value="${item.memo}"></div>
            
            <button id="btn-save-item" style="width:100%; background:var(--primary-color); color:white; border:none; padding:12px; border-radius:var(--border-radius-md); font-weight:bold; margin-bottom:12px;">
                ${isNew ? 'クローゼットに登録' : '変更を保存'}
            </button>
            <button id="btn-cancel-item" class="btn-outline text-center">キャンセル</button>
        </div>
    `;
    lucide.createIcons();
    
    document.getElementById('btn-cancel-item').addEventListener('click', closeModal);
    document.getElementById('btn-save-item').addEventListener('click', () => {
        const newData = {
            category: document.getElementById('input-category').value || '未分類',
            color: document.getElementById('input-color').value || '未設定',
            style: document.getElementById('input-style').value || '未設定',
            season: document.getElementById('input-season').value || '未設定',
            memo: document.getElementById('input-memo').value || ''
        };
        
        if (isNew) {
            closetItems.push({ id: Date.now(), image: item.image, ...newData });
            nativeCameraInput.value = '';
        } else {
            const target = closetItems.find(i => i.id === existingId);
            Object.assign(target, newData);
        }
        
        closeModal();
        if(currentRoute === 'closet') { const t = currentRoute; currentRoute = ''; navigate(t); }
        else navigate('closet');
    });
}

function closeModal() { modalContainer.classList.add('hidden'); }
window.setTheme = function(themeName) { document.body.className = `theme-${themeName}`; localStorage.setItem('ai-closet-theme', themeName); updateThemeButtons(); };
function updateThemeButtons() {
    const currentTheme = localStorage.getItem('ai-closet-theme') || 'morning';
    const btns = document.querySelectorAll('.theme-btn');
    if(btns.length > 0) { btns.forEach(b => b.classList.remove('active')); if(currentTheme === 'morning') btns[0].classList.add('active'); else if(currentTheme === 'sunset') btns[1].classList.add('active'); else if(currentTheme === 'night') btns[2].classList.add('active'); }
}
function init() {
    const savedTheme = localStorage.getItem('ai-closet-theme') || 'morning'; document.body.className = `theme-${savedTheme}`;
    mainContent.style.transition = 'opacity 0.15s ease';
    setTimeout(() => { initGoogleAuth(); }, 1000);
    fetchWeather(); navigate('home');
    setTimeout(() => { lucide.createIcons(); }, 50);
}
init();
