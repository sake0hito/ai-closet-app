// モックデータ
const mockData = {
    weather: {
        temp: "取得中...",
        condition: "取得中...",
        icon: "loader",
        location: "東京都"
    },
    todayOutfit: {
        title: "大学・カフェ向け爽やかコーデ",
        image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=400&q=80",
        tags: ["カジュアル", "春", "動きやすい"],
        reason: "今日は暖かく晴れるため、通気性の良いシャツとデニムの組み合わせが最適です。"
    }
};

let closetItems = [];
let currentRoute = '';

const mainContent = document.getElementById('main-content');
const headerTitle = document.getElementById('header-title');
const navButtons = document.querySelectorAll('.nav-btn');
const fabAdd = document.getElementById('fab-add');
const modalContainer = document.getElementById('modal-container');

// Open-Meteo APIを用いた天気取得（非同期）
async function fetchWeather() {
    try {
        const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=35.6895&longitude=139.6917&current_weather=true&timezone=Asia%2FTokyo');
        const data = await response.json();
        const current = data.current_weather;
        
        let condition = "晴れ";
        let icon = "sun";
        if (current.weathercode >= 1 && current.weathercode <= 3) {
            condition = "曇り"; icon = "cloud";
        } else if (current.weathercode >= 45 && current.weathercode <= 48) {
            condition = "霧"; icon = "cloud-fog";
        } else if (current.weathercode >= 51 && current.weathercode <= 67) {
            condition = "雨"; icon = "cloud-rain";
        } else if (current.weathercode >= 71) {
            condition = "雪"; icon = "snowflake";
        }
        
        mockData.weather.temp = `${Math.round(current.temperature)}°C`;
        mockData.weather.condition = condition;
        mockData.weather.icon = icon;
        
        if (currentRoute === 'home') {
            const weatherWidget = document.querySelector('.weather-widget');
            if (weatherWidget) {
                weatherWidget.innerHTML = `
                    <i data-lucide="${icon}" class="weather-icon"></i>
                    <div class="weather-info">
                        <h2>${mockData.weather.temp}</h2>
                        <p>${mockData.weather.location} / ${mockData.weather.condition}</p>
                    </div>
                `;
                lucide.createIcons();
            }
        }
    } catch (e) {
        console.error("天気情報の取得に失敗しました", e);
        mockData.weather.temp = "--°C";
        mockData.weather.condition = "エラー";
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
                    <div>
                        ${mockData.todayOutfit.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                    </div>
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
        render: () => {
            if (closetItems.length === 0) {
                return `
                    <p class="text-center" style="color: var(--text-secondary); margin-top: 40px;">
                        <i data-lucide="package-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px;"></i><br>
                        服のデータがありません。<br>右下の＋ボタンから追加してください。
                    </p>
                `;
            }
            return `
                <div class="closet-grid">
                    ${closetItems.map(item => `
                        <div class="closet-item">
                            <img src="${item.image}" alt="${item.category}">
                            <div class="item-tags">
                                <span class="tag-small">${item.category}</span>
                                <span class="tag-small">${item.color}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    },
    history: {
        title: "着用履歴",
        showFab: false,
        render: () => `
            <div class="card">
                <h3 class="section-title">今週の履歴</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">まだ履歴がありません。</p>
            </div>
        `
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
                <h3 class="section-title">アカウント管理</h3>
                <div class="account-info">
                    <div class="avatar"><i data-lucide="user"></i></div>
                    <div>
                        <p style="font-weight: 600;">鮭ひろき</p>
                        <p style="color: var(--text-secondary); font-size: 0.8rem;">liyuandagui80@gmail.com</p>
                    </div>
                </div>
                
                <div class="setting-row mt-4">
                    <span><i data-lucide="fingerprint" class="inline-icon"></i> 生体認証ログイン</span>
                    <label class="toggle-switch">
                        <input type="checkbox" checked>
                        <span class="slider"></span>
                    </label>
                </div>
                
                <button class="btn-outline text-danger mt-4" onclick="alert('ログアウト処理（モック）')">
                    <i data-lucide="log-out" class="inline-icon"></i> ログアウト
                </button>
            </div>
        `
    }
};

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        navigate(btn.getAttribute('data-target'));
    });
});

function navigate(route) {
    if (currentRoute === route) return;
    
    navButtons.forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-target="${route}"]`).classList.add('active');
    
    currentRoute = route;
    const view = routes[route];
    
    headerTitle.textContent = view.title;
    
    mainContent.style.opacity = '0';
    setTimeout(() => {
        mainContent.innerHTML = view.render();
        lucide.createIcons();
        
        if (view.showFab) {
            fabAdd.classList.remove('hidden');
        } else {
            fabAdd.classList.add('hidden');
        }
        
        mainContent.style.opacity = '1';
        
        if(route === 'settings') {
            updateThemeButtons();
        }
    }, 150);
}

// ＋ボタン押下時のモーダル処理
fabAdd.addEventListener('click', () => {
    modalContainer.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <h3 class="section-title">服を登録</h3>
            <div id="upload-area" class="upload-area">
                <i data-lucide="camera" style="width: 32px; height: 32px; margin-bottom: 8px;"></i>
                <p>タップしてカメラ撮影<br><span style="font-size: 0.8rem; opacity: 0.8;">または画像を選択</span></p>
            </div>
            <div id="ai-analysis" class="hidden text-center mt-4 mb-4">
                <i data-lucide="loader" class="spinner" style="width: 32px; height: 32px; color: var(--primary-color); margin-bottom: 12px;"></i>
                <p style="font-weight: 600;">AIが服を解析中...</p>
                <p style="font-size: 0.8rem; color: var(--text-secondary);">カテゴリ・色・季節を判定しています</p>
            </div>
            <button id="close-modal" class="btn-outline mt-4 text-center">キャンセル</button>
        </div>
    `;
    modalContainer.classList.remove('hidden');
    lucide.createIcons();
    
    document.querySelector('.modal-overlay').addEventListener('click', closeModal);
    document.getElementById('close-modal').addEventListener('click', closeModal);
    
    document.getElementById('upload-area').addEventListener('click', () => {
        document.getElementById('upload-area').classList.add('hidden');
        document.getElementById('close-modal').classList.add('hidden');
        document.getElementById('ai-analysis').classList.remove('hidden');
        
        // AI解析のモック遅延（2秒）
        setTimeout(() => {
            const mockImages = [
                "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=300&q=80", // T-shirt
                "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=300&q=80", // Jeans
                "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=300&q=80" // Jacket
            ];
            const categories = ["トップス", "ボトムス", "アウター"];
            const colors = ["白", "ブルー", "黒"];
            
            const randIndex = Math.floor(Math.random() * 3);
            
            closetItems.push({
                image: mockImages[randIndex],
                category: categories[randIndex],
                color: colors[randIndex]
            });
            
            closeModal();
            // 現在の画面がクローゼットなら再描画
            if(currentRoute === 'closet') {
                const tempRoute = currentRoute;
                currentRoute = ''; // 強制再描画のため
                navigate(tempRoute);
            }
        }, 2000);
    });
});

function closeModal() {
    modalContainer.classList.add('hidden');
}

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
    
    // 天気取得を開始
    fetchWeather();
    
    navigate('home');
    
    setTimeout(() => {
       lucide.createIcons(); 
    }, 50);
}

init();
