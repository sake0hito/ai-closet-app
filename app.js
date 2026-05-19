// モックデータ
const mockData = {
    weather: {
        temp: "22°C",
        condition: "晴れ",
        icon: "sun",
        location: "東京都"
    },
    todayOutfit: {
        title: "大学・カフェ向け爽やかコーデ",
        image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=400&q=80",
        tags: ["カジュアル", "春", "動きやすい"],
        reason: "今日は22度と暖かく晴れるため、通気性の良いシャツとデニムの組み合わせが最適です。"
    }
};

let currentRoute = '';
const mainContent = document.getElementById('main-content');
const headerTitle = document.getElementById('header-title');
const navButtons = document.querySelectorAll('.nav-btn');
const fabAdd = document.getElementById('fab-add');

const routes = {
    home: {
        title: "ホーム",
        showFab: false,
        render: () => `
            <div class="weather-widget">
                <i data-lucide="${mockData.weather.icon}" class="weather-icon"></i>
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
                        <i data-lucide="sparkles" style="width: 14px; height: 14px; display: inline; margin-right: 4px;"></i>
                        ${mockData.todayOutfit.reason}
                    </p>
                </div>
            </div>
        `
    },
    closet: {
        title: "クローゼット",
        showFab: true,
        render: () => `
            <p class="text-center" style="color: var(--text-secondary); margin-top: 40px;">
                <i data-lucide="package-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 16px;"></i><br>
                服のデータがありません。<br>右下の＋ボタンから追加してください。
            </p>
        `
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
                <h3 class="section-title">アカウント情報</h3>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">鮭ひろき<br>ID: user_001</p>
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
    navigate('home');
    
    setTimeout(() => {
       lucide.createIcons(); 
    }, 50);
}

init();
