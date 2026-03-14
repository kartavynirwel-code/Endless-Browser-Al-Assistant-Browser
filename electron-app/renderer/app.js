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

// ── Data ──
let bookmarks = storage.get('gravity_bookmarks', []);
let history = storage.get('gravity_history', []);
let settings = storage.get('gravity_settings', { homePage: HOME_URL, searchEngine: 'google', backendUrl: BACKEND_URL, autoOpen: false, accentColor: '#7c6aff' });
let profile = storage.get('gravity_profile', { name: 'User', email: '' });

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
    historyPanel: $('historyPanel'), historyList: $('historyList'), clearHistoryBtn: $('clearHistoryBtn'),
    settingsPanel: $('settingsPanel'), profilePanel: $('profilePanel'), aboutPanel: $('aboutPanel'),
    // Menu items
    menuBookmarks: $('menuBookmarks'), menuHistory: $('menuHistory'), menuDownloads: $('menuDownloads'),
    menuNewTab: $('menuNewTab'), menuProfile: $('menuProfile'), menuSettings: $('menuSettings'), menuAbout: $('menuAbout'),
    // Settings
    settingHomePage: $('settingHomePage'), settingSearchEngine: $('settingSearchEngine'),
    settingBackendUrl: $('settingBackendUrl'), settingAutoOpen: $('settingAutoOpen'),
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
    url = url || settings.homePage || HOME_URL;
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

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tabId);
    });

    const webview = document.createElement('webview');
    webview.src = url;
    webview.setAttribute('autosize', 'on');
    webview.setAttribute('partition', 'persist:gravity');
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
dom.newTabBtn.addEventListener('click', () => createTab());

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
    storage.set('gravity_bookmarks', bookmarks);
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
            storage.set('gravity_bookmarks', bookmarks);
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
    storage.set('gravity_history', history);
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
            storage.set('gravity_history', history);
            renderHistory();
        });
    });
}

dom.clearHistoryBtn.addEventListener('click', () => {
    history = [];
    storage.set('gravity_history', history);
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
dom.menuHistory.addEventListener('click', () => { closeMenu(); renderHistory(); openPanel('historyPanel'); });
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
    settings.autoOpen = dom.settingAutoOpen.checked;
    storage.set('gravity_settings', settings);
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
    storage.set('gravity_profile', profile);
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

dom.sidebarTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        dom.sidebarTabs.forEach(t => t.classList.remove('active'));
        dom.sidebarPanels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        $(tab.dataset.panel).classList.add('active');
    });
});

// ==============================================
// KEYBOARD SHORTCUTS
// ==============================================

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); createTab(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); if (activeTabId) closeTab(activeTabId); }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); toggleSidebar(); }
    if (e.key === 'Escape') {
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
    
    // Typing effect (word-by-word)
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
        textEl.textContent += words[i] + (i === words.length - 1 ? '' : ' ');
        scrollChat();
        await new Promise(r => setTimeout(r, 25)); // Slightly faster: 25ms per word
    }
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
// NATIVE AUTOMATION
// ==============================================

async function executeActions(wv, actions, originalCommand) {
    const userWantsSubmit = originalCommand.toLowerCase().includes('submit');

    for (const action of actions) {
        if (!automationRunning) break;
        
        await new Promise(resolve => setTimeout(resolve, 600)); // human-like delay
        const { action: type, targetId, value, reason } = action;
        
        appendLog(`Action: ${type} - ${reason}`, 'acting');
        if (reason) appendAssistantMessage(`🤖 ${reason}`);

        // Safety Layer: Detect destructive actions (Submit)
        const destructiveKeywords = ['submit', 'buy', 'purchase', 'pay'];
        if (destructiveKeywords.some(kw => reason?.toLowerCase().includes(kw) || type === 'submit')) {
            if (userWantsSubmit) {
                appendLog('Auto-proceeding with submission as requested in command.', 'info');
            } else {
                appendAssistantMessage('🛑 Stopping: AI reached a "Submit" action, but you didn\'t ask to "submit" in your command. You can manually click Submit now.');
                automationRunning = false;
                return false; 
            }
        }

        try {
            switch(type) {
                case 'click':
                    await wv.executeJavaScript(`
                        document.querySelector('[data-gravity-id="${targetId}"]').click()
                    `);
                    break;
                    
                case 'type':
                    await wv.executeJavaScript(`
                        (async () => {
                            const el = document.querySelector('[data-gravity-id="${targetId}"]');
                            if (!el) return;
                            el.focus();
                            el.value = '';
                            const chars = ${JSON.stringify(value)}.split('');
                            for (let i = 0; i < chars.length; i++) {
                                await new Promise(r => setTimeout(r, 30)); // slightly faster typing: 30ms
                                el.value += chars[i];
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        })()
                    `);
                    break;
                    
                case 'select':
                    await wv.executeJavaScript(`
                        (() => {
                            const el = document.querySelector('[data-gravity-id="${targetId}"]');
                            if (el) {
                                el.value = "${value}";
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        })()
                    `);
                    break;
                    
                case 'scroll':
                    await wv.executeJavaScript(`
                        window.scrollBy(0, ${value || 400})
                    `);
                    break;
                    
                case 'keypress':
                    await wv.executeJavaScript(`
                        const el = document.querySelector('[data-gravity-id="${targetId}"]');
                        if (el) el.dispatchEvent(new KeyboardEvent('keydown', { key: "${value}", bubbles: true }));
                    `);
                    break;
                
                case 'done':
                    return true;
            }
        } catch (err) {
            appendLog(`Action error: ${err.message}`, 'error');
        }

        // Send live log to UI via WebSocket (mocked as log update since STOMP logic is handled in controller)
        appendLog(`Finished: ${reason}`, 'success');
    }
    return true;
}

async function runAutomationTask(instruction) {
    const wv = getActiveWebview();
    if (!wv) {
        appendAssistantMessage('No active tab to control.');
        return;
    }

    automationRunning = true;
    let stepHistory = [];
    let maxSteps = 10; // safety limit
    
    document.getElementById('automationOverlay').classList.remove('hidden');

    try {
        for (let step = 0; step < maxSteps && automationRunning; step++) {
            appendLog(`Step ${step + 1}: Capturing screen and DOM...`);
            
            // 1. Capture screen (JPEG 0.6 for smaller payload)
            const image = await wv.capturePage();
            const base64Img = image.toDataURL('image/jpeg', 0.6);
            appendAssistantImage(base64Img);

            // 1b. Extract detailed DOM structure (Step 1)
            const domElements = await wv.executeJavaScript(`
                (() => {
                    const results = [];
                    // Only target visible and actually relevant elements
                    document.querySelectorAll(
                        'input:not([type="hidden"]), button, select, textarea, [role="button"], a'
                    ).forEach((el, i) => {
                        const rect = el.getBoundingClientRect();
                        if (rect.width === 0 || rect.height === 0) return;
                        
                        el.setAttribute('data-gravity-id', i);
                        results.push({
                            id: i,
                            tag: el.tagName,
                            type: el.type || '',
                            placeholder: el.placeholder || '',
                            text: el.innerText ? el.innerText.trim().substring(0, 40) : '',
                            name: el.name || '',
                            rect: { x: Math.round(rect.left), y: Math.round(rect.top), w: Math.round(rect.width), h: Math.round(rect.height) }
                        });
                    });
                    return results.slice(0, 60); // Max 60 elements for context window safety
                })()
            `);

            // 2. Query the new Backend Execute Endpoint (Step 2)
            const backendUrl = settings.backendUrl || BACKEND_URL;
            const currentUrl = wv.getURL();
            
            appendAssistantMessage(`Step ${step + 1}: AI is thinking...`);
            handleStatus('thinking');

            const resp = await fetch(backendUrl + '/api/automation/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    command: instruction, 
                    screenshot: base64Img, 
                    dom: domElements,
                    url: currentUrl,
                    history: stepHistory
                })
            });

            if (!resp.ok) {
                appendAssistantMessage('Automation backend error.');
                break;
            }

            const actions = await resp.json();
            
            // If AI says "done", stop the loop
            if (actions.length === 0 || actions[0]?.action === 'done') {
                appendAssistantMessage('✅ Task complete!');
                break;
            }

            // 3. Act (Step 3)
            handleStatus('acting');
            const success = await executeActions(wv, actions, instruction);
            if (success === false) break; // Loop stopped by safety logic
            
            stepHistory.push(`Step ${step + 1}: Executed ${actions.length} actions: ${actions.map(a => a.reason).join(', ')}`);
            
            // Wait for page to settle
            await new Promise(r => setTimeout(r, 1500));
        }

    } catch (e) {
        appendLog(`Automation loop error: ${e.message}`, 'error');
    } finally {
        const overlay = document.getElementById('automationOverlay');
        if (overlay) overlay.classList.add('hidden');
        automationRunning = false;
        handleStatus('idle');
    }
}

// Smart send: if message starts with "/do " use automation endpoint, otherwise use chat
async function sendMessage() {
    const text = dom.chatInput.value.trim();
    if (!text && !currentAttachedImage) return;
    if (text) appendUserMessage(text);
    else if (currentAttachedImage) appendUserMessage('[Image Attached]');

    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
    
    // Grab the image before clearing state
    const sentImage = currentAttachedImage;
    if (dom.removeImageBtn) dom.removeImageBtn.click(); // Reset upload state UI

    if (!isSidebarOpen) toggleSidebar();
    showThinkingIndicator();

    const isAutomation = text && (
        text.toLowerCase().startsWith('/do ') ||
        text.toLowerCase().startsWith('automate ') ||
        text.toLowerCase().startsWith('do task:')
    );

    const backendUrl = settings.backendUrl || BACKEND_URL;

    if (isAutomation) {
        const instruction = text.replace(/^\/do\s+/i, '');
        if (automationRunning) {
            appendAssistantMessage('I am already working on a task! Please click Stop first.');
            removeThinkingIndicator();
            return;
        }
        appendLog('Automation started: ' + instruction);
        // Kick off asynchronous native loop
        runAutomationTask(instruction);
    } else {
        // Chat-only Q&A
        try {
            const reqBody = { message: text || "Analyze this image" };
            if (sentImage) {
                reqBody.image = sentImage;
            }
            const resp = await fetch(backendUrl + '/api/gravity/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody)
            });
            const data = await resp.json();
            removeThinkingIndicator();
            appendAssistantMessage(data.reply || 'No response received.');
        } catch (err) {
            removeThinkingIndicator();
            appendAssistantMessage('Could not connect to backend. Is the server running on ' + backendUrl + '?');
        }
    }
}

async function stopTask() {
    automationRunning = false;
    const overlay = document.getElementById('automationOverlay');
    if (overlay) overlay.classList.add('hidden');
    appendAssistantMessage('Stopping the current task...');
    handleStatus('idle');
}

dom.chatInput.addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
dom.sendBtn.addEventListener('click', sendMessage);
dom.stopBtn.addEventListener('click', stopTask);
dom.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

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

// ==============================================
// INIT
// ==============================================

applySettings();
createTab(settings.homePage || HOME_URL);
connectWebSocket();
if (settings.autoOpen) toggleSidebar();
if (dom.statBookmarks) dom.statBookmarks.textContent = bookmarks.length;
if (dom.statHistory) dom.statHistory.textContent = history.length;
