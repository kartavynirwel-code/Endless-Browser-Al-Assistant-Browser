/* =============================================
   ENDLESS BROWSER — Full Frontend Logic
   Multi-tab, bookmarks, history, settings,
   profile, menu, WebSocket AI chat
   ============================================= */

const BACKEND_URL = 'http://localhost:8082';
const HOME_URL = 'https://www.google.com';

const $ = id => document.getElementById(id);

// ── Persistent Storage ──
const storage = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } },
    set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

// ── CMD Palette ──
const cmdPaletteOverlay = $('cmdPaletteOverlay');
const cmdInput = $('cmdInput');
const cmdResults = $('cmdResults');
let cmdPaletteOpen = false;
let cmdSelectedIndex = 0;
let currentCmdItems = [];

// ── Data ──
let bookmarks = storage.get('endless_bookmarks', []);
let history = storage.get('endless_history', []);
let settings = storage.get('endless_settings', { homePage: 'https://www.google.com', searchEngine: 'google', backendUrl: 'http://localhost:8082', autoOpen: false, accentColor: '#7c6aff' });
let profile = storage.get('endless_profile', { name: 'User', email: '' });

// ── DOM ──
const dom = {
    minimizeBtn: $('minimizeBtn'), maximizeBtn: $('maximizeBtn'), closeBtn: $('closeBtn'),
    tabsContainer: $('tabsContainer'), newTabBtn: $('newTabBtn'), assistantToggle: $('assistantToggle'),
    backBtn: $('backBtn'), forwardBtn: $('forwardBtn'), reloadBtn: $('reloadBtn'), homeBtn: $('homeBtn'),
    addressBar: $('addressBar'), securityIcon: $('securityIcon'),
    bookmarkBtn: $('bookmarkBtn'), bookmarkIcon: $('bookmarkIcon'),
    menuBtn: $('menuBtn'), menuDropdown: $('menuDropdown'),
    browserPane: $('browserPane'),
    sidebar: $('assistantSidebar'), closeSidebarBtn: $('closeSidebarBtn'),
    statusDot: $('statusDot'), statusText: $('statusText'),
    sidebarTabs: document.querySelectorAll('.sidebar-tab'),
    sidebarPanels: document.querySelectorAll('.sidebar-panel'),
    chatMessages: $('chatMessages'), chatInput: $('chatInput'), sendBtn: $('sendBtn'), stopBtn: $('stopBtn'),
    attachBtn: $('attachBtn'), mediaUpload: $('mediaUpload'), imagePreviewContainer: $('imagePreviewContainer'), imagePreview: $('imagePreview'), removeImageBtn: $('removeImageBtn'),
    logsContainer: $('logsContainer'),
    // Panels
    bookmarksPanel: $('bookmarksPanel'), bookmarksList: $('bookmarksList'),
    browsingHistoryPanel: $('browsingHistoryPanel'), historyList: $('historyList'), clearHistoryBtn: $('clearHistoryBtn'),
    chatHistoryPanel: $('chatHistoryPanel'),
    settingsPanel: $('settingsPanel'), profilePanel: $('profilePanel'), aboutPanel: $('aboutPanel'),
    // Menu items
    menuBookmarks: $('menuBookmarks'), menuHistory: $('menuHistory'), menuDownloads: $('menuDownloads'),
    menuNewTab: $('menuNewTab'), menuProfile: $('menuProfile'), menuSettings: $('menuSettings'), menuAbout: $('menuAbout'),
    // Settings
    settingHomePage: $('settingHomePage'), settingSearchEngine: $('settingSearchEngine'),
    settingBackendUrl: $('settingBackendUrl'), settingAutoOpen: $('settingAutoOpen'), settingGeminiKey: $('settingGeminiKey'),
    saveSettingsBtn: $('saveSettingsBtn'), accentColorOptions: $('accentColorOptions'),
    // Profile
    profileName: $('profileName'), profileEmail: $('profileEmail'), saveProfileBtn: $('saveProfileBtn'),
    statBookmarks: $('statBookmarks'), statHistory: $('statHistory'), statTabs: $('statTabs'),
};

// ── State ──
let stompClient = null;
let isSidebarOpen = false;
let tabIdCounter = 0;
let activeTabId = null;
let automationRunning = false;
const tabs = new Map();
let chatSessionId = storage.get('endless_chat_session', 'chat-' + Math.random().toString(36).substring(2, 11));
storage.set('endless_chat_session', chatSessionId);
let chatAbortController = null;
let jwtToken = localStorage.getItem('endless_jwt_token');
let currentUser = localStorage.getItem('endless_username');

// Generate UI overlay for automation dynamically
const overlay = document.createElement('div');
overlay.id = 'automationOverlay';
overlay.className = 'hidden';
overlay.innerHTML = `
    <div class="wave-container">
        <div class="wave"></div>
        <div class="wave"></div>
        <div class="wave"></div>
    </div>
`;
dom.browserPane.appendChild(overlay);

// ── Apply saved settings on load ──
function applySettings() {
    dom.settingHomePage.value = settings.homePage || HOME_URL;
    dom.settingSearchEngine.value = settings.searchEngine || 'google';
    dom.settingBackendUrl.value = settings.backendUrl || BACKEND_URL;
    if (dom.settingGeminiKey) dom.settingGeminiKey.value = settings.geminiKey || '';
    dom.settingAutoOpen.checked = settings.autoOpen || false;
    if (settings.accentColor) {
        document.documentElement.style.setProperty('--accent', settings.accentColor);
        document.querySelectorAll('.color-opt').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === settings.accentColor);
        });
    }
    dom.profileName.value = profile.name || 'User';
    dom.profileEmail.value = profile.email || '';
}

// ── Window Controls ──
if (window.electronAPI) {
    dom.minimizeBtn.addEventListener('click', () => window.electronAPI.minimize());
    dom.maximizeBtn.addEventListener('click', () => window.electronAPI.maximize());
    dom.closeBtn.addEventListener('click', () => window.electronAPI.close());
}

// ==============================================
// TAB MANAGEMENT
// ==============================================

function createTab(url) {
    url = url || settings.homePage || HOME_URL || 'https://www.google.com';
    tabIdCounter++;
    const tabId = tabIdCounter;

    const tabEl = document.createElement('div');
    tabEl.className = 'browser-tab';
    tabEl.dataset.tabId = tabId;
    tabEl.innerHTML = `
    <i class="fa-solid fa-globe tab-favicon"></i>
    <span class="tab-title">New Tab</span>
    <button class="tab-close"><i class="fa-solid fa-xmark"></i></button>
  `;
    dom.tabsContainer.appendChild(tabEl);

    tabEl.addEventListener('click', (e) => {
        if (e.target.closest('.tab-close')) return;
        switchToTab(tabId);
    });

    tabEl.addEventListener('dblclick', (e) => {
        if (e.target.closest('.tab-close')) return;
        closeTab(tabId);
    });

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tabId);
    });

    const webview = document.createElement('webview');
    webview.src = url;
    webview.setAttribute('autosize', 'on');
    webview.setAttribute('partition', 'persist:endless');
    webview.style.cssText = 'flex:1; border:none; display:none; width:100%; height:100%;';
    dom.browserPane.appendChild(webview);

    webview.addEventListener('did-start-loading', () => {
        if (tabId === activeTabId) dom.reloadBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    });

    webview.addEventListener('did-stop-loading', () => {
        if (tabId === activeTabId) dom.reloadBtn.innerHTML = '<i class="fa-solid fa-rotate-right"></i>';
    });

    webview.addEventListener('did-navigate', (e) => {
        const tab = tabs.get(tabId);
        if (tab) tab.url = e.url;
        if (tabId === activeTabId) { updateAddressBar(e.url); updateBookmarkStar(); }
        addToHistory(tab ? tab.title : '', e.url);
    });

    webview.addEventListener('did-navigate-in-page', (e) => {
        if (e.isMainFrame) {
            const tab = tabs.get(tabId);
            if (tab) tab.url = e.url;
            if (tabId === activeTabId) { updateAddressBar(e.url); updateBookmarkStar(); }
        }
    });

    webview.addEventListener('page-title-updated', (e) => {
        const tab = tabs.get(tabId);
        if (tab) {
            tab.title = e.title || 'New Tab';
            tabEl.querySelector('.tab-title').textContent = tab.title;
        }
    });

    webview.addEventListener('page-favicon-updated', (e) => {
        if (e.favicons && e.favicons.length > 0) {
            const favicon = tabEl.querySelector('.tab-favicon');
            if (!favicon) return;
            const img = document.createElement('img');
            img.src = e.favicons[0];
            img.style.cssText = 'width:14px; height:14px; border-radius:2px; flex-shrink:0;';
            img.onerror = () => { const i = document.createElement('i'); i.className = 'fa-solid fa-globe tab-favicon'; img.replaceWith(i); };
            favicon.replaceWith(img);
        }
    });

    webview.addEventListener('new-window', (e) => createTab(e.url));

    tabs.set(tabId, { tabEl, webview, title: 'New Tab', url });
    switchToTab(tabId);
    updateTabCount();
    return tabId;
}

function switchToTab(tabId) {
    if (!tabs.has(tabId)) return;
    tabs.forEach(tab => { tab.tabEl.classList.remove('active'); tab.webview.style.display = 'none'; });
    const tab = tabs.get(tabId);
    tab.tabEl.classList.add('active');
    tab.webview.style.display = 'flex';
    activeTabId = tabId;
    updateAddressBar(tab.url || settings.homePage || HOME_URL);
    updateBookmarkStar();
    tab.tabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
}

function closeTab(tabId) {
    if (!tabs.has(tabId)) return;
    const tab = tabs.get(tabId);
    if (tabs.size <= 1) { createTab(); }
    else if (tabId === activeTabId) {
        const ids = Array.from(tabs.keys());
        switchToTab(ids[ids.indexOf(tabId) + 1] || ids[ids.indexOf(tabId) - 1]);
    }
    tab.tabEl.remove();
    tab.webview.remove();
    tabs.delete(tabId);
    updateTabCount();
}

function getActiveWebview() {
    if (!activeTabId || !tabs.has(activeTabId)) return null;
    return tabs.get(activeTabId).webview;
}

function updateTabCount() {
    if (dom.statTabs) dom.statTabs.textContent = tabs.size;
}

// ==============================================
// NAVIGATION
// ==============================================

function updateAddressBar(url) {
    dom.addressBar.value = url || '';
    if (url && url.startsWith('https://')) { dom.securityIcon.className = 'fa-solid fa-lock address-icon'; dom.securityIcon.style.color = ''; }
    else if (url && url.startsWith('http://')) { dom.securityIcon.className = 'fa-solid fa-lock-open address-icon'; dom.securityIcon.style.color = 'var(--warning)'; }
    else { dom.securityIcon.className = 'fa-solid fa-globe address-icon'; dom.securityIcon.style.color = ''; }
}

dom.backBtn.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wv.canGoBack()) wv.goBack(); });
dom.forwardBtn.addEventListener('click', () => { const wv = getActiveWebview(); if (wv && wv.canGoForward()) wv.goForward(); });
dom.reloadBtn.addEventListener('click', () => { const wv = getActiveWebview(); if (!wv) return; wv.isLoading() ? wv.stop() : wv.reload(); });
dom.homeBtn.addEventListener('click', () => { const wv = getActiveWebview(); if (wv) wv.loadURL(settings.homePage || HOME_URL); });

dom.addressBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        let val = dom.addressBar.value.trim();
        if (!val) return;
        const wv = getActiveWebview();
        if (!wv) return;
        
        // Treat as URL if it starts with http/https, starts with localhost, or has a dot with no spaces
        const isUrl = val.startsWith('http://') || 
                      val.startsWith('https://') || 
                      val.startsWith('localhost') || 
                      (val.includes('.') && !val.includes(' '));
                      
        if (isUrl) {
            if (!val.startsWith('http://') && !val.startsWith('https://')) val = 'http://' + val;
            wv.loadURL(val);
        } else {
            const engines = { google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', duckduckgo: 'https://duckduckgo.com/?q=' };
            wv.loadURL((engines[settings.searchEngine] || engines.google) + encodeURIComponent(val));
        }
        dom.addressBar.blur();
    }
});

dom.addressBar.addEventListener('focus', () => dom.addressBar.select());
dom.newTabBtn.addEventListener('click', () => createTab('https://www.google.com'));

// ==============================================
// BOOKMARKS
// ==============================================

function toggleBookmark() {
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const url = tab.url;
    const idx = bookmarks.findIndex(b => b.url === url);
    if (idx >= 0) {
        bookmarks.splice(idx, 1);
    } else {
        bookmarks.push({ title: tab.title || 'Untitled', url, time: Date.now() });
    }
    storage.set('endless_bookmarks', bookmarks);
    updateBookmarkStar();
    if (dom.statBookmarks) dom.statBookmarks.textContent = bookmarks.length;
}

function updateBookmarkStar() {
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const isBookmarked = bookmarks.some(b => b.url === tab.url);
    dom.bookmarkIcon.className = isBookmarked ? 'fa-solid fa-star bookmarked' : 'fa-regular fa-star';
}

function renderBookmarks() {
    if (bookmarks.length === 0) {
        dom.bookmarksList.innerHTML = '<div class="empty-state"><i class="fa-regular fa-star"></i><p>No bookmarks yet. Click the star icon to bookmark pages.</p></div>';
        return;
    }
    dom.bookmarksList.innerHTML = bookmarks.map((b, i) => `
    <div class="list-item" data-url="${escapeAttr(b.url)}">
      <div class="list-item-icon"><i class="fa-solid fa-star" style="color:var(--warning);"></i></div>
      <div class="list-item-info">
        <div class="list-item-title">${escapeHtml(b.title)}</div>
        <div class="list-item-url">${escapeHtml(b.url)}</div>
      </div>
      <button class="list-item-delete" data-idx="${i}" title="Remove"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join('');

    dom.bookmarksList.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.list-item-delete')) return;
            createTab(el.dataset.url);
            closePanel('bookmarksPanel');
        });
    });
    dom.bookmarksList.querySelectorAll('.list-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            bookmarks.splice(parseInt(btn.dataset.idx), 1);
            storage.set('endless_bookmarks', bookmarks);
            renderBookmarks();
            updateBookmarkStar();
        });
    });
}

dom.bookmarkBtn.addEventListener('click', toggleBookmark);

// ==============================================
// HISTORY
// ==============================================

function addToHistory(title, url) {
    if (!url || url === 'about:blank') return;
    // Avoid duplicating the last entry
    if (history.length > 0 && history[0].url === url) return;
    history.unshift({ title: title || url, url, time: Date.now() });
    if (history.length > 500) history.length = 500;
    storage.set('endless_history', history);
    if (dom.statHistory) dom.statHistory.textContent = history.length;
}

function renderHistory() {
    if (history.length === 0) {
        dom.historyList.innerHTML = '<div class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i><p>No browsing history yet.</p></div>';
        return;
    }
    dom.historyList.innerHTML = history.slice(0, 100).map((h, i) => `
    <div class="list-item" data-url="${escapeAttr(h.url)}">
      <div class="list-item-icon"><i class="fa-solid fa-clock-rotate-left"></i></div>
      <div class="list-item-info">
        <div class="list-item-title">${escapeHtml(h.title)}</div>
        <div class="list-item-url">${escapeHtml(h.url)}</div>
      </div>
      <div class="list-item-time">${timeAgo(h.time)}</div>
      <button class="list-item-delete" data-idx="${i}" title="Remove"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join('');

    dom.historyList.querySelectorAll('.list-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.list-item-delete')) return;
            createTab(el.dataset.url);
            closePanel('historyPanel');
        });
    });
    dom.historyList.querySelectorAll('.list-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            history.splice(parseInt(btn.dataset.idx), 1);
            storage.set('endless_history', history);
            renderHistory();
        });
    });
}

dom.clearHistoryBtn.addEventListener('click', () => {
    history = [];
    storage.set('endless_history', history);
    renderHistory();
    if (dom.statHistory) dom.statHistory.textContent = 0;
});

// ==============================================
// MENU DROPDOWN
// ==============================================

let menuOpen = false;
dom.menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuOpen = !menuOpen;
    dom.menuDropdown.classList.toggle('hidden', !menuOpen);
});

document.addEventListener('click', () => {
    if (menuOpen) { menuOpen = false; dom.menuDropdown.classList.add('hidden'); }
});

dom.menuBookmarks.addEventListener('click', () => { closeMenu(); renderBookmarks(); openPanel('bookmarksPanel'); });
dom.menuHistory.addEventListener('click', () => { closeMenu(); renderHistory(); openPanel('browsingHistoryPanel'); });
dom.menuNewTab.addEventListener('click', () => { closeMenu(); createTab(); });
dom.menuProfile.addEventListener('click', () => { closeMenu(); updateProfileStats(); openPanel('profilePanel'); });
dom.menuSettings.addEventListener('click', () => { closeMenu(); openPanel('settingsPanel'); });
dom.menuAbout.addEventListener('click', () => { closeMenu(); openPanel('aboutPanel'); });
dom.menuDownloads.addEventListener('click', () => { closeMenu(); });

function closeMenu() { menuOpen = false; dom.menuDropdown.classList.add('hidden'); }

// ==============================================
// OVERLAY PANELS
// ==============================================

function openPanel(id) { $(id).classList.remove('hidden'); }
function closePanel(id) { $(id).classList.add('hidden'); }

document.querySelectorAll('.overlay-close').forEach(btn => {
    btn.addEventListener('click', () => closePanel(btn.dataset.closePanel));
});

document.querySelectorAll('.overlay-panel').forEach(panel => {
    panel.addEventListener('click', (e) => {
        if (e.target === panel) closePanel(panel.id);
    });
});

// ==============================================
// SETTINGS
// ==============================================

dom.accentColorOptions.addEventListener('click', (e) => {
    const btn = e.target.closest('.color-opt');
    if (!btn) return;
    document.querySelectorAll('.color-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    settings.accentColor = btn.dataset.color;
    document.documentElement.style.setProperty('--accent', btn.dataset.color);
});

dom.saveSettingsBtn.addEventListener('click', () => {
    settings.homePage = dom.settingHomePage.value || HOME_URL;
    settings.searchEngine = dom.settingSearchEngine.value || 'google';
    settings.backendUrl = dom.settingBackendUrl.value || BACKEND_URL;
    settings.geminiKey = (dom.settingGeminiKey && dom.settingGeminiKey.value) || '';
    settings.autoOpen = dom.settingAutoOpen.checked;
    storage.set('endless_settings', settings);
    closePanel('settingsPanel');
});

// ==============================================
// PROFILE
// ==============================================

function updateProfileStats() {
    dom.statBookmarks.textContent = bookmarks.length;
    dom.statHistory.textContent = history.length;
    dom.statTabs.textContent = tabs.size;
}

dom.saveProfileBtn.addEventListener('click', () => {
    profile.name = dom.profileName.value;
    profile.email = dom.profileEmail.value;
    storage.set('endless_profile', profile);
    closePanel('profilePanel');
});

// ==============================================
// SIDEBAR
// ==============================================

function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
    dom.sidebar.classList.toggle('open', isSidebarOpen);
    dom.assistantToggle.classList.toggle('active', isSidebarOpen);
    if (isSidebarOpen) dom.chatInput.focus();
}

dom.assistantToggle.addEventListener('click', toggleSidebar);
dom.closeSidebarBtn.addEventListener('click', toggleSidebar);
updateAuthUI();

// Event Listeners for tabs & auth
document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const panelId = tab.dataset.panel;
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
        const targetPanel = document.getElementById(panelId);
        if (targetPanel) targetPanel.classList.add('active');
        if (panelId === 'chatHistoryPanel') fetchHistory();
    });
});

document.getElementById('userActionBtn').addEventListener('click', () => {
    if (jwtToken) logout();
    else document.getElementById('loginOverlay').classList.remove('hidden');
});

document.getElementById('toSignup').addEventListener('click', () => {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('signupOverlay').classList.remove('hidden');
});

document.getElementById('toLogin').addEventListener('click', () => {
    document.getElementById('signupOverlay').classList.add('hidden');
    document.getElementById('loginOverlay').classList.remove('hidden');
});

document.getElementById('loginSubmit').addEventListener('click', loginUser);
document.getElementById('signupSubmit').addEventListener('click', signupUser);
document.getElementById('refreshHistory').addEventListener('click', fetchHistory);

// ==============================================
// KEYBOARD SHORTCUTS
// ==============================================

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); createTab(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); toggleSidebar(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleCmdPalette(); }
    
    if (cmdPaletteOpen) {
        if (e.key === 'ArrowDown') { e.preventDefault(); selectCmdItem(1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); selectCmdItem(-1); }
        if (e.key === 'Enter') { e.preventDefault(); executeSelectedCmdItem(); }
    }
    
    if (e.key === 'Escape') {
        if (cmdPaletteOpen) toggleCmdPalette();
        if (isSidebarOpen) toggleSidebar();
        document.querySelectorAll('.overlay-panel:not(.hidden)').forEach(p => closePanel(p.id));
        if (menuOpen) closeMenu();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); dom.addressBar.focus(); }
    if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const ids = Array.from(tabs.keys());
        if (ids.length <= 1) return;
        const idx = ids.indexOf(activeTabId);
        switchToTab(ids[e.shiftKey ? (idx - 1 + ids.length) % ids.length : (idx + 1) % ids.length]);
    }
});

// ==============================================
// WEBSOCKET
// ==============================================

function connectWebSocket() {
    try {
        const url = settings.backendUrl || BACKEND_URL;
        const socket = new SockJS(url + '/ws/gravity');
        stompClient = Stomp.over(socket);
        stompClient.debug = null;
        stompClient.connect({}, function () {
            setStatus('connected', 'Connected');
            stompClient.subscribe('/topic/logs', function (msg) {
                const data = JSON.parse(msg.body);
                appendLog(data.message, 'info');
                if (data.message.includes('AI Feedback:') || data.message.includes('Error:') || data.message.includes('success')) {
                    appendAssistantMessage(data.message.replace('AI Feedback: ', ''));
                }
            });
            stompClient.subscribe('/topic/screen', () => appendLog('Screenshot captured', 'info'));
            stompClient.subscribe('/topic/status', function (msg) { handleStatus(JSON.parse(msg.body).status); });
        }, function () {
            setStatus('error', 'Disconnected');
            setTimeout(connectWebSocket, 5000);
        });
    } catch (e) {
        setStatus('error', 'Backend offline');
        setTimeout(connectWebSocket, 5000);
    }
}

function setStatus(state, text) { dom.statusDot.className = 'status-dot ' + state; dom.statusText.textContent = text; }

function handleStatus(status) {
    const s = status.toLowerCase();
    if (s === 'thinking' || s === 'acting') {
        setStatus('thinking', s === 'thinking' ? 'Thinking...' : 'Acting...');
        dom.sendBtn.classList.add('hidden'); dom.stopBtn.classList.remove('hidden'); dom.chatInput.disabled = true;
    } else {
        setStatus('connected', 'Ready');
        dom.sendBtn.classList.remove('hidden'); dom.stopBtn.classList.add('hidden'); dom.chatInput.disabled = false;
        // When backend sends 'idle' or 'done', also clean up automation state
        if (automationRunning && (s === 'idle' || s === 'done')) {
            automationRunning = false;
            const overlay = document.getElementById('automationOverlay');
            if (overlay) overlay.classList.add('hidden');
        }
        if (s === 'done') appendLog('Task completed.', 'success');
    }
}

// ==============================================
// MEDIA UPLOAD
// ==============================================

let currentAttachedImage = null;

if (dom.attachBtn) {
    dom.attachBtn.addEventListener('click', () => {
        dom.mediaUpload.click();
    });
}

if (dom.mediaUpload) {
    dom.mediaUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                currentAttachedImage = event.target.result;
                dom.imagePreview.src = currentAttachedImage;
                dom.imagePreviewContainer.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    });
}

if (dom.removeImageBtn) {
    dom.removeImageBtn.addEventListener('click', () => {
        currentAttachedImage = null;
        dom.mediaUpload.value = '';
        dom.imagePreviewContainer.classList.add('hidden');
        dom.imagePreview.src = '';
    });
}

// ==============================================
// CHAT
// ==============================================

function appendUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'chat-msg user-msg';
    div.innerHTML = `<div class="msg-avatar"><i class="fa-solid fa-user"></i></div><div class="msg-content"><div class="msg-text">${escapeHtml(text)}</div></div>`;
    dom.chatMessages.appendChild(div);
    scrollChat();
}

async function appendAssistantMessage(text) {
    if (!text || !text.trim()) return;
    removeThinkingIndicator();
    const div = document.createElement('div');
    div.className = 'chat-msg assistant-msg';
    div.innerHTML = `<div class="msg-avatar"><i class="fa-solid fa-sparkles"></i></div><div class="msg-content"><div class="msg-text"></div></div>`;
    dom.chatMessages.appendChild(div);
    const textEl = div.querySelector('.msg-text');
    
    if (typeof marked !== 'undefined') {
        textEl.innerHTML = marked.parse(text);
        scrollChat();
    } else {
        // Fallback
        textEl.textContent = text;
        scrollChat();
    }
}

function createAssistantMessageBubble() {
    removeThinkingIndicator();
    const div = document.createElement('div');
    div.className = 'chat-msg assistant-msg';
    div.innerHTML = `<div class="msg-avatar"><i class="fa-solid fa-sparkles"></i></div><div class="msg-content"><div class="msg-text"></div></div>`;
    dom.chatMessages.appendChild(div);
    scrollChat();
    return div.querySelector('.msg-text');
}

function appendAssistantImage(base64Image) {
    removeThinkingIndicator();
    const div = document.createElement('div');
    div.className = 'chat-msg assistant-msg';
    div.innerHTML = `
        <div class="msg-avatar"><i class="fa-solid fa-sparkles"></i></div>
        <div class="msg-content">
            <div class="msg-screenshot">
                <img src="${base64Image}" alt="Screen View" style="max-width: 200px; border-radius: 8px; border: 1px solid var(--border-medium); cursor: pointer;" onclick="window.open('${base64Image}')">
            </div>
        </div>
    `;
    dom.chatMessages.appendChild(div);
    scrollChat();
}

function showThinkingIndicator() {
    if (document.querySelector('.thinking-indicator')) return;
    const div = document.createElement('div');
    div.className = 'chat-msg assistant-msg'; div.id = 'thinkingIndicator';
    div.innerHTML = `<div class="msg-avatar"><i class="fa-solid fa-sparkles"></i></div><div class="msg-content"><div class="thinking-indicator"><div class="thinking-dots"><span></span><span></span><span></span></div><span>Thinking...</span></div></div>`;
    dom.chatMessages.appendChild(div);
    scrollChat();
}

function removeThinkingIndicator() { const el = $('thinkingIndicator'); if (el) el.remove(); }
function scrollChat() { dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight; }

function appendLog(text) {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const div = document.createElement('div');
    const t = text.toLowerCase();
    let cls = 'info';
    if (t.includes('error')) cls = 'error';
    else if (t.includes('success') || t.includes('done')) cls = 'success';
    else if (t.includes('acting') || t.includes('execut')) cls = 'acting';
    else if (t.includes('think') || t.includes('analyz')) cls = 'thinking';
    div.className = 'log-entry ' + cls;
    div.textContent = `[${time}] ${text}`;
    dom.logsContainer.appendChild(div);
    dom.logsContainer.scrollTop = dom.logsContainer.scrollHeight;
}

// ==============================================
// SELENIUM-POWERED AUTOMATION (Backend-driven)
// ==============================================

async function runAutomationTask(instruction) {
    const wv = getActiveWebview();
    if (!wv) {
        appendAssistantMessage('No active tab to control.');
        return;
    }

    if (automationRunning) {
        appendAssistantMessage('⚠️ Automation already running. Click Stop first.');
        removeThinkingIndicator();
        return;
    }

    automationRunning = true;
    document.getElementById('automationOverlay').classList.remove('hidden');
    handleStatus('thinking');

    const backendUrl = settings.backendUrl || BACKEND_URL;

    // Try Selenium first, fallback to JS-based automation
    try {
        const currentUrl = wv.getURL();
        appendLog('🚀 Starting automation: ' + instruction);

        const resp = await fetch(backendUrl + '/api/automation/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: instruction, url: currentUrl })
        });

        if (resp.ok) {
            const data = await resp.json();
            appendAssistantMessage('🤖 ' + (data.message || 'Automation started! Watch logs for progress.'));
            appendLog('✅ Selenium automation started', 'success');
            // WebSocket will handle status updates
            return;
        }
    } catch (e) {
        appendLog('⚠️ Selenium unavailable, using built-in automation...', 'info');
    }

    // ── JS-based fallback automation ──
    appendAssistantMessage('🤖 Using built-in automation...');
    
    try {
        const startResp = await fetch(backendUrl + '/api/automation/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: instruction })
        });
        const session = await startResp.json();
        const sessionId = session.id;

        for (let step = 0; step < 10 && automationRunning; step++) {
            appendLog(`Step ${step + 1}: Capturing page...`);

            const image = step === 0
                ? (await wv.capturePage()).toDataURL('image/jpeg', 0.4)
                : null;
            if (step === 0 && image) appendAssistantImage(image);

            const domElements = await wv.executeJavaScript(`
                (() => {
                    const results = [];
                    document.querySelectorAll(
                        'input:not([type="hidden"]), button, select, textarea,' +
                        '[role="button"],[role="combobox"],[role="searchbox"],[role="textbox"],a,label'
                    ).forEach((el, i) => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) return;
                        const tag = el.tagName.toLowerCase();
                        el.setAttribute('data-gravity-id', i);
                        let labelText = '';
                        const lbl = document.querySelector('label[for="' + el.id + '"]') || el.closest('label');
                        if (lbl) labelText = lbl.innerText.trim();
                        results.push({
                            id: i, tag, type: el.type || '',
                            text: (el.innerText || '').trim().substring(0, 80),
                            label: labelText.substring(0, 80),
                            placeholder: (el.placeholder || '').substring(0, 60),
                            name: el.name || '',
                            checked: el.checked || false,
                            isInteractive: true
                        });
                    });
                    return JSON.stringify(results.slice(0, 80));
                })()
            `);

            const pageText = await wv.executeJavaScript(
                `document.body.innerText.substring(0, 4000)`
            );

            handleStatus('thinking');
            appendAssistantMessage(`Step ${step + 1}: AI thinking...`);

            const resp = await fetch(backendUrl + '/api/automation/step', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    screenshot: image,
                    dom: domElements,
                    pageText,
                    url: wv.getURL()
                })
            });

            if (!resp.ok) { appendAssistantMessage('❌ Backend error.'); break; }

            const result = await resp.json();

            if (result.status === 'DONE') {
                appendAssistantMessage('✅ Task complete!'); break;
            }

            if (result.status === 'NEEDS_CONFIRMATION') {
                handleStatus('acting');
                await executeActions(wv, result.actions || [], instruction);
                appendAssistantMessage('⚠️ ' + result.message);
                appendAssistantMessage('✅ Form filled! Click Submit manually.');
                break;
            }

            handleStatus('acting');
            const success = await executeActions(wv, result.actions || [], instruction);
            if (!success) break;

            await new Promise(r => setTimeout(r, 800));
        }
    } catch (e) {
        appendLog('❌ Automation error: ' + e.message, 'error');
        appendAssistantMessage('❌ Error: ' + e.message);
    } finally {
        document.getElementById('automationOverlay').classList.add('hidden');
        automationRunning = false;
        handleStatus('idle');
    }
}

async function executeActions(wv, actions, originalCommand) {
    let success = true;
    for (const act of actions) {
        if (!automationRunning) return false;
        try {
            const type = act.action;
            const targetId = act.target;
            const value = act.value;
            appendLog(`Executing: ${type} ${targetId ? 'on #' + targetId : ''} ${value ? 'val: ' + value : ''}`, 'acting');

            if (type === 'done') return true;

            if (type === 'navigate') {
                await wv.loadURL(value.startsWith('http') ? value : 'https://' + value);
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            const jsExec = `
            (() => {
                const el = document.querySelector('[data-gravity-id="${targetId}"]');
                if (!el) return false;
                el.scrollIntoView({ behavior: 'instant', block: 'center' });
                if ('${type}' === 'click') {
                    if (el.type === 'radio' || el.type === 'checkbox') {
                        el.checked = true;
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    el.click();
                } else if ('${type}' === 'type') {
                    el.value = \`${value || ''}\`.replace(/\\\\/g, '\\\\\\\\');
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                } else if ('${type}' === 'select') {
                    if (el.tagName.toLowerCase() === 'select') {
                        const opts = Array.from(el.options);
                        const targetOpt = opts.find(o => o.text.trim() === \`${value || ''}\`.replace(/\\\\/g, '\\\\\\\\') || o.value === \`${value || ''}\`.replace(/\\\\/g, '\\\\\\\\'));
                        if (targetOpt) {
                            el.value = targetOpt.value;
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    } else {
                        el.value = \`${value || ''}\`.replace(/\\\\/g, '\\\\\\\\');
                    }
                }
                return true;
            })()`;
            const result = await wv.executeJavaScript(jsExec);
            if (!result) appendLog('Failed to find element ' + targetId, 'error');
        } catch (e) {
            appendLog('Action error: ' + e.message, 'error');
            success = false;
        }
    }
    return success;
}

// Smart send: if message starts with "/do " use automation (Selenium), otherwise use chat
async function sendMessage() {
    const text = dom.chatInput.value.trim();
    if (!text && !currentAttachedImage) return;
    if (text) appendUserMessage(text);
    else if (currentAttachedImage) appendUserMessage('[Image Attached]');

    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
    // Hide slash menu on send
    const slashMenu = document.getElementById('slashCommandsMenu');
    if (slashMenu) slashMenu.classList.add('hidden');
    
    // Grab the image before clearing state
    const sentImage = currentAttachedImage;
    if (dom.removeImageBtn) dom.removeImageBtn.click(); // Reset upload state UI

    if (!isSidebarOpen) toggleSidebar();
    showThinkingIndicator();

    // FIX: Only trigger automation with explicit /do command or exact action commands
    // This prevents normal chat from being hijacked by broad keyword matching
    const lowerText = (text || '').toLowerCase();
    const isAutomation = text && (
        text.startsWith('/do') ||        // Explicit /do command
        text.startsWith('/extract')      // Explicit /extract command
    );
    const isSummarize = text && text.startsWith('/summarize');
    const isSearchCmd = text && text.startsWith('/search');
    
    // (isSummarize and isSearchCmd defined above)

    const backendUrl = settings.backendUrl || BACKEND_URL;

    if (isAutomation && !isSummarize && !isSearchCmd) {
        let instruction = text
            .replace(/^\/do\s+/i, '')
            .replace(/^\/automate\s+/i, '')
            .replace(/^automate\s+/i, '')
            .replace(/^do task:\s*/i, '');
        
        if (automationRunning) {
            appendAssistantMessage('I am already working on a task! Please click Stop first.');
            removeThinkingIndicator();
            return;
        }
        appendLog('Automation started: ' + instruction);
        // Kick off asynchronous native loop
        runAutomationTask(instruction);
    } else if (isSummarize) {
        // Summarize the current page via chat
        try {
            const wv = getActiveWebview();
            let pageContent = '';
            if (wv) {
                pageContent = await wv.executeJavaScript(`document.body.innerText.substring(0, 8000)`);
            }
            const chatMsg = `Please summarize the following web page content:
---
${pageContent}
---`;
            if (chatAbortController) chatAbortController.abort();
            chatAbortController = new AbortController();
            handleStatus('thinking');
            const resp = await fetch(backendUrl + '/api/gravity/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': jwtToken ? `Bearer ${jwtToken}` : '' },
                body: JSON.stringify({ message: chatMsg, sessionId: chatSessionId }),
                signal: chatAbortController.signal
            });
            if (!resp.ok) throw new Error('Network response was not ok');
            removeThinkingIndicator();
            const textEl = createAssistantMessageBubble();
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';
            let accumulatedResponse = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                sseBuffer += chunk;
                const eventBlocks = sseBuffer.split('\n\n');
                sseBuffer = eventBlocks.pop();
                for (const block of eventBlocks) {
                    const lines = block.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            let contentString = line.slice(5).trim();
                            if (contentString) {
                                try { let j = JSON.parse(contentString); if (j.content) accumulatedResponse += j.content; } 
                                catch (e) { accumulatedResponse += line.slice(5).replace(/^ /, ''); }
                            }
                        }
                    }
                }
                if (typeof marked !== 'undefined') textEl.innerHTML = marked.parse(accumulatedResponse);
                else textEl.textContent = accumulatedResponse;
                scrollChat();
            }
        } catch (err) {
            removeThinkingIndicator();
            if (err.name !== 'AbortError') appendAssistantMessage('Error: ' + err.message);
        } finally { chatAbortController = null; handleStatus('idle'); }
    } else {
        // Chat-only Q&A with Streaming
        try {
            if (chatAbortController) chatAbortController.abort();
            chatAbortController = new AbortController();
            
            handleStatus('thinking');

            const reqBody = { 
                message: text || "Analyze this image",
                sessionId: chatSessionId
            };
            if (sentImage) {
                reqBody.image = sentImage;
            }
            
            const resp = await fetch(backendUrl + '/api/gravity/chat/stream', {
                method: 'POST', 
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': jwtToken ? `Bearer ${jwtToken}` : ''
                },
                body: JSON.stringify(reqBody),
                signal: chatAbortController.signal
            });

            if (!resp.ok) throw new Error('Network response was not ok');

            removeThinkingIndicator();
            const textEl = createAssistantMessageBubble();
            
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';
            let accumulatedResponse = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                sseBuffer += chunk;
                
                const eventBlocks = sseBuffer.split('\n\n');
                sseBuffer = eventBlocks.pop(); // Keep incomplete block in buffer
                
                for (const block of eventBlocks) {
                    const lines = block.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            let contentString = line.slice(5).trim();
                            if (contentString) {
                                try {
                                    let jsonDecoded = JSON.parse(contentString);
                                    if (jsonDecoded.content) {
                                        accumulatedResponse += jsonDecoded.content;
                                    }
                                } catch (e) {
                                    // Fallback if not JSON
                                    accumulatedResponse += line.slice(5).replace(/^ /, '');
                                }
                            }
                        }
                    }
                }
                
                if (typeof marked !== 'undefined') {
                    textEl.innerHTML = marked.parse(accumulatedResponse);
                } else {
                    textEl.textContent = accumulatedResponse;
                }
                scrollChat();
            }
        } catch (err) {
            removeThinkingIndicator();
            if (err.name === 'AbortError') {
                appendAssistantMessage('Generation stopped.');
            } else {
                appendAssistantMessage('Error: ' + err.message);
            }
        } finally {
            chatAbortController = null;
            handleStatus('idle');
        }
    }
}

async function stopTask() {
    if (chatAbortController) {
        chatAbortController.abort();
        chatAbortController = null;
    }
    
    // Stop Selenium automation on the backend too
    if (automationRunning) {
        const backendUrl = settings.backendUrl || BACKEND_URL;
        try {
            await fetch(backendUrl + '/api/automation/stop', { method: 'POST' });
        } catch (e) {
            console.warn('Could not send stop to backend:', e);
        }
        try {
            await fetch(backendUrl + '/api/gravity/stop', { method: 'POST' });
        } catch (e) {
            console.warn('Could not send stop to backend:', e);
        }
    }
    
    automationRunning = false;
    const overlay = document.getElementById('automationOverlay');
    if (overlay) overlay.classList.add('hidden');
    appendAssistantMessage('Stopping the current task...');
    handleStatus('idle');
}

// Authentication Functions
function updateAuthUI() {
    const userBtn = document.getElementById('userActionBtn');
    const headerUsername = document.getElementById('headerUsername');
    if (jwtToken) {
        userBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
        userBtn.title = "Logout";
        headerUsername.textContent = currentUser;
    } else {
        userBtn.innerHTML = '<i class="fa-solid fa-user-circle"></i>';
        userBtn.title = "Login";
        headerUsername.textContent = "";
    }
}

async function loginUser() {
    const user = document.getElementById('loginUsername').value;
    const pass = document.getElementById('loginPassword').value;
    if (!user || !pass) return alert('Fill in all fields');
    const url = settings.backendUrl || BACKEND_URL;
    
    const submitBtn = document.getElementById('loginSubmit');
    submitBtn.textContent = 'Signing In...';
    try {
        const resp = await fetch(url + '/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });
        
        const rawText = await resp.text();
        let data = {};
        try {
            data = JSON.parse(rawText);
        } catch(e) {
            data = { message: 'Unexpected server response (Code ' + resp.status + ')' };
        }

        if (resp.ok) {
            jwtToken = data.token;
            currentUser = data.username;
            localStorage.setItem('endless_jwt_token', jwtToken);
            localStorage.setItem('endless_username', currentUser);
            document.getElementById('loginOverlay').classList.add('hidden');
            updateAuthUI();
            appendAssistantMessage(`Welcome back, ${currentUser}! History synced.`);
            fetchHistory();
        } else {
            alert(data.message || 'Login failed - Incorrect credentials');
        }
    } catch (err) {
        alert('Network or Server Error: ' + err.message);
    } finally {
        submitBtn.textContent = 'Sign In';
    }
}

async function signupUser() {
    const user = document.getElementById('signupUsername').value;
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPassword').value;
    if (!user || !email || !pass) return alert('Fill in all fields');
    const url = settings.backendUrl || BACKEND_URL;
    
    const submitBtn = document.getElementById('signupSubmit');
    submitBtn.textContent = 'Creating...';
    try {
        const resp = await fetch(url + '/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, email: email, password: pass })
        });
        
        const rawText = await resp.text();
        let data = {};
        try {
            data = JSON.parse(rawText);
        } catch(e) {
            data = { message: 'Unexpected server response (Code ' + resp.status + ')' };
        }

        if (resp.ok) {
            alert('Account created! Please login.');
            document.getElementById('signupOverlay').classList.add('hidden');
            document.getElementById('loginOverlay').classList.remove('hidden');
        } else {
            alert(data.message || 'Signup failed');
        }
    } catch (err) {
        alert('Network or Server Error: ' + err.message);
    } finally {
        submitBtn.textContent = 'Create Account';
    }
}

function logout() {
    jwtToken = null;
    currentUser = null;
    localStorage.removeItem('endless_jwt_token');
    localStorage.removeItem('endless_username');
    updateAuthUI();
    appendAssistantMessage('Logged out successfully.');
    document.getElementById('chatHistoryList').innerHTML = '<div class="empty-state"><p>Login to see history.</p></div>';
}

// History Functions
async function fetchHistory() {
    if (!jwtToken) {
        const list = document.getElementById('chatHistoryList');
        if (list) list.innerHTML = 
            '<div class="empty-state"><p>Please login to see history.</p></div>';
        return;
    }
    
    const list = document.getElementById('chatHistoryList');
    list.innerHTML = '<div class="loading" style="padding: 20px; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>';
    const url = settings.backendUrl || BACKEND_URL;
    
    try {
        const resp = await fetch(url + '/api/gravity/history', {
            headers: { 'Authorization': `Bearer ${jwtToken}` }
        });
        if (resp.ok) {
            const data = await resp.json();
            renderChatHistory(data);
        } else if (resp.status === 401) {
            logout();
        } else {
            list.innerHTML = '<div class="error" style="padding: 20px; color: var(--danger);">Failed to load history.</div>';
        }
    } catch (err) {
        list.innerHTML = '<div class="error" style="padding: 20px; color: var(--danger);">Error connecting to server.</div>';
    }
}

function renderChatHistory(messages) {
    const list = document.getElementById('chatHistoryList');
    if (!messages || messages.length === 0) {
        list.innerHTML = '<div class="empty-state"><p>No history yet.</p></div>';
        return;
    }
    
    list.innerHTML = '';
    
    // Group messages by session id (or just show all for now)
    // For a better UX, we would group by sessionId
    const sessions = {};
    messages.forEach(msg => {
        if (!sessions[msg.sessionId]) {
            sessions[msg.sessionId] = {
                title: msg.content.substring(0, 30) + '...',
                date: new Date(msg.timestamp).toLocaleString(),
                lastMsg: msg.timestamp
            };
        }
        // Update title if it's the first user message
        if (msg.role === 'user' && sessions[msg.sessionId].title.length > 50) {
             sessions[msg.sessionId].title = msg.content.substring(0, 30) + '...';
        }
    });

    Object.keys(sessions).forEach(sid => {
        const sess = sessions[sid];
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <div class="history-item-date"><i class="fa-regular fa-clock"></i> ${sess.date}</div>
            <div class="history-item-preview">${sess.title}</div>
        `;
        item.addEventListener('click', () => {
            // Restore session
            chatSessionId = sid;
            storage.set('endless_chat_session', chatSessionId);
            // Clear current chat display and ideally reload session messages
            document.getElementById('chatMessages').innerHTML = '';
            messages.filter(m => m.sessionId === sid).forEach(m => {
                if (m.role === 'user') appendUserMessage(m.content);
                else {
                    const tempDiv = document.createElement('div');
                    tempDiv.className = 'chat-msg assistant-msg';
                    tempDiv.innerHTML = `<div class="msg-avatar"><i class="fa-solid fa-sparkles"></i></div><div class="msg-content"><div class="msg-text"></div></div>`;
                    document.getElementById('chatMessages').appendChild(tempDiv);
                    if (typeof marked !== 'undefined') {
                        tempDiv.querySelector('.msg-text').innerHTML = marked.parse(m.content);
                    } else {
                        tempDiv.querySelector('.msg-text').textContent = m.content;
                    }
                    scrollChat();
                }
            });
            // Switch to chat panel
            document.querySelector('[data-panel="chatPanel"]').click();
        });
        list.appendChild(item);
    });
}

const slashConfig = [
    { cmd: '/do', desc: 'Automate a web task (e.g. /do fill login form)', icon: 'fa-robot' },
    { cmd: '/summarize', desc: 'Summarize the current page', icon: 'fa-file-lines' },
    { cmd: '/search', desc: 'Search the web using AI', icon: 'fa-magnifying-glass' },
    { cmd: '/extract', desc: 'Extract data from page into a table', icon: 'fa-table' }
];

function renderSlashMenu(query) {
    const list = document.getElementById('slashCommandsMenu');
    const filtered = slashConfig.filter(c => c.cmd.startsWith(query.toLowerCase()));
    if (filtered.length === 0) { list.innerHTML = '<div style="padding: 15px; color: var(--text-muted); font-size: 13px; text-align: center;">No commands match</div>'; return; }
    list.innerHTML = filtered.map(c => `
        <div class="slash-item" style="padding: 12px 16px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.05);" data-cmd="${c.cmd} " onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='none'">
            <div style="background: rgba(124,106,255,0.2); width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: var(--accent-light);"><i class="fa-solid ${c.icon}"></i></div>
            <div style="flex: 1;">
                <div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">${c.cmd}</div>
                <div style="font-size: 12px; color: var(--text-muted);">${c.desc}</div>
            </div>
        </div>
    `).join('');
    list.querySelectorAll('.slash-item').forEach(item => {
        item.addEventListener('click', () => {
            dom.chatInput.value = item.dataset.cmd;
            dom.chatInput.focus();
            list.classList.add('hidden');
        });
    });
}

dom.chatInput.addEventListener('input', function () { 
    this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; 
    const val = this.value;
    const slashMenu = document.getElementById('slashCommandsMenu');
    if (val.startsWith('/')) { slashMenu.classList.remove('hidden'); renderSlashMenu(val); } 
    else { slashMenu.classList.add('hidden'); }
});
dom.sendBtn.addEventListener('click', sendMessage);
dom.stopBtn.addEventListener('click', stopTask);
dom.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

// Add enter key support for forms
document.getElementById('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') loginUser(); });
document.getElementById('signupPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') signupUser(); });

// ==============================================
// UTILITIES
// ==============================================

function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function escapeAttr(text) { return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return new Date(ts).toLocaleDateString();
}

// ── MICRO INTERACTIONS ──
document.addEventListener('click', function(e) {
    const btn = e.target.closest('.nav-btn, .sidebar-tab, .sidebar-close-btn, .send-btn, .auth-btn, .save-settings-btn, .titlebar-btn, .new-tab-btn, .list-item');
    if (btn) {
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement('span');
        const dia = Math.max(btn.clientWidth, btn.clientHeight);
        const radius = dia / 2;
        ripple.style.width = ripple.style.height = `${dia}px`;
        ripple.style.left = `${e.clientX - rect.left - radius}px`;
        ripple.style.top = `${e.clientY - rect.top - radius}px`;
        ripple.className = 'ripple';
        
        if (window.getComputedStyle(btn).position === 'static') {
            btn.style.position = 'relative';
        }
        btn.style.overflow = 'hidden';
        btn.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    }
});

// ── COMMAND PALETTE Logic ──
function toggleCmdPalette() {
    cmdPaletteOpen = !cmdPaletteOpen;
    cmdPaletteOverlay.classList.toggle('hidden', !cmdPaletteOpen);
    if (cmdPaletteOpen) { cmdInput.value = ''; renderCmdResults(''); setTimeout(() => cmdInput.focus(), 50); }
}

function selectCmdItem(dir) {
    if (currentCmdItems.length === 0) return;
    cmdSelectedIndex = (cmdSelectedIndex + dir + currentCmdItems.length) % currentCmdItems.length;
    document.querySelectorAll('.cmd-result-item').forEach((el, i) => {
        el.classList.toggle('selected', i === cmdSelectedIndex);
        if (i === cmdSelectedIndex) el.scrollIntoView({ block: 'nearest' });
    });
}

function executeSelectedCmdItem() {
    if (currentCmdItems.length === 0) return;
    const item = currentCmdItems[cmdSelectedIndex];
    toggleCmdPalette(); // close
    if (item.type === 'tab') { switchToTab(item.id); } 
    else if (item.type === 'action') { item.action(); }
    else { createTab(item.url); }
}

function renderCmdResults(query) {
    query = query.toLowerCase();
    let results = [];
    
    // Actions if starts with >
    if (query.startsWith('>')) {
        const actionQ = query.slice(1).trim();
        const actions = [
            { id: 'a1', title: 'New Tab', icon: 'fa-plus', type: 'action', action: createTab },
            { id: 'a2', title: 'Toggle AI Assistant', icon: 'fa-sparkles', type: 'action', action: toggleSidebar },
            { id: 'a3', title: 'Open Settings', icon: 'fa-gear', type: 'action', action: () => openPanel('settingsPanel') },
            { id: 'a4', title: 'View History', icon: 'fa-clock-rotate-left', type: 'action', action: () => { openPanel('browsingHistoryPanel'); renderHistory(); } }
        ];
        results = actions.filter(a => a.title.toLowerCase().includes(actionQ));
    } else {
        // Open Tabs
        tabs.forEach((tab, id) => {
            if (tab.title.toLowerCase().includes(query) || (tab.url||'').toLowerCase().includes(query)) {
                results.push({ id, title: tab.title, desc: tab.url, icon: 'fa-globe', type: 'tab' });
            }
        });
        // Bookmarks
        bookmarks.forEach(b => {
             if (b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)) {
                results.push({ id: b.url, title: b.title, desc: b.url, icon: 'fa-star', type: 'bookmark', url: b.url });
             }
        });
        // History limit 5
        history.slice(0, 20).forEach(h => {
             if (h.title.toLowerCase().includes(query) || h.url.toLowerCase().includes(query)) {
                 if (!results.some(r => r.url === h.url)) {
                    results.push({ id: h.url, title: h.title, desc: h.url, icon: 'fa-clock-rotate-left', type: 'history', url: h.url });
                 }
             }
        });
    }

    currentCmdItems = results.slice(0, 8); // Limits length UI
    cmdSelectedIndex = 0;
    
    if (currentCmdItems.length === 0) {
        cmdResults.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No matching results found</div>';
        return;
    }

    cmdResults.innerHTML = currentCmdItems.map((r, i) => `
        <div class="cmd-result-item ${i === 0 ? 'selected' : ''}" data-idx="${i}">
            <div class="cmd-result-icon"><i class="fa-solid ${r.icon}"></i></div>
            <div style="flex: 1; overflow: hidden;">
                <div style="font-weight: 500; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; overflow: hidden; color: var(--text-primary);">${escapeHtml(r.title)}</div>
                ${r.desc ? `<div style="font-size: 12px; color: var(--text-muted); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${escapeHtml(r.desc)}</div>` : ''}
            </div>
            ${r.type === 'action' ? '<div style="font-size: 11px; color: var(--text-muted); background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">Command</div>' : ''}
            ${r.type === 'tab' ? '<div style="font-size: 11px; color: var(--text-muted); background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px;">Tab</div>' : ''}
        </div>
    `).join('');

    cmdResults.querySelectorAll('.cmd-result-item').forEach(el => {
        el.addEventListener('mousemove', () => {
            cmdSelectedIndex = parseInt(el.dataset.idx);
            document.querySelectorAll('.cmd-result-item').forEach((e, i) => e.classList.toggle('selected', i === cmdSelectedIndex));
        });
        el.addEventListener('click', executeSelectedCmdItem);
    });
}

cmdInput.addEventListener('input', (e) => renderCmdResults(e.target.value));

// ==============================================
// INIT
// ==============================================

applySettings();
// Ensure correct backend URL is applied if localStorage was stale
if (settings.backendUrl === 'http://localhost:8080') {
    settings.backendUrl = 'http://localhost:8082';
}
createTab('https://www.google.com');
connectWebSocket();
if (settings.autoOpen) toggleSidebar();
if (dom.statBookmarks) dom.statBookmarks.textContent = bookmarks.length;
if (dom.statHistory) dom.statHistory.textContent = history.length;
