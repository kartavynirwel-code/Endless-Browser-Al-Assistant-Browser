let stompClient = null;

const UI = {
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    instructionInput: document.getElementById('instructionInput'),
    chatHistory: document.getElementById('chatHistory'),
    logsContainer: document.getElementById('logsContainer'),
    liveScreenshot: document.getElementById('liveScreenshot'),
    browserOverlay: document.getElementById('browserOverlay'),
    statusIndicator: document.getElementById('globalStatus'),

    // Sidebar Elements
    sidebar: document.getElementById('gravitySidebar'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    panels: document.querySelectorAll('.panel-content')
};

// Toggle Sidebar
UI.sidebarToggleBtn.addEventListener('click', () => {
    UI.sidebar.classList.add('active');
});

UI.closeSidebarBtn.addEventListener('click', () => {
    UI.sidebar.classList.remove('active');
});

// Tab Switching
UI.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all buttons and panels
        UI.tabBtns.forEach(b => b.classList.remove('active'));
        UI.panels.forEach(p => p.classList.remove('active'));

        // Add active class to clicked button and target panel
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-target')).classList.add('active');

        // Auto-scroll chat/logs if needed when becoming active
        UI.chatHistory.scrollTop = UI.chatHistory.scrollHeight;
        UI.logsContainer.scrollTop = UI.logsContainer.scrollHeight;
    });
});

// Auto-resize textarea
UI.instructionInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight < 120 ? this.scrollHeight : 120) + 'px';
});

function connectWebSocket() {
    const socket = new SockJS('/ws/gravity');
    stompClient = Stomp.over(socket);
    stompClient.debug = null; // Disable debug logging

    stompClient.connect({}, function (frame) {
        console.log('Connected: ' + frame);

        stompClient.subscribe('/topic/logs', function (message) {
            const data = JSON.parse(message.body);
            appendLog(data.message, 'info');
            // Show some key updates in chat too to mimic Comet thinking process
            if (data.message.includes("AI Feedback:") || data.message.includes("Error:") || data.message.includes("success")) {
                let msgText = data.message.replace("AI Feedback: ", "");
                // Only append if it's meaningful
                appendMessage(msgText, 'system');
            }
        });

        stompClient.subscribe('/topic/screen', function (message) {
            const data = JSON.parse(message.body);
            updateScreenshot(data.image);
        });

        stompClient.subscribe('/topic/status', function (message) {
            const data = JSON.parse(message.body);
            updateStatus(data.status);
        });

    }, function (error) {
        console.error('WebSocket Error:', error);
        setTimeout(connectWebSocket, 5000); // Reconnect attempt
    });
}

function appendMessage(text, type) {
    // Avoid double logging empty or redundant messages
    if (!text || text.trim() === '') return;

    const msgWrapper = document.createElement('div');
    msgWrapper.className = `message ${type}-msg`;

    if (type === 'user') {
        msgWrapper.innerHTML = `
            <div class="msg-bubble">${escapeHtml(text)}</div>
        `;
    } else {
        msgWrapper.innerHTML = `
            <div class="avatar"><i class="fa-solid fa-sparkles"></i></div>
            <div class="msg-bubble">${escapeHtml(text)}</div>
        `;
    }

    UI.chatHistory.appendChild(msgWrapper);
    UI.chatHistory.scrollTop = UI.chatHistory.scrollHeight;
}

function appendLog(text, type = 'info') {
    const logDiv = document.createElement('div');
    logDiv.className = `log-entry ${getLogClass(text)}`;

    const time = new Date().toLocaleTimeString([], { hour12: false });
    logDiv.textContent = `[${time}] ${text}`;

    UI.logsContainer.appendChild(logDiv);
    UI.logsContainer.scrollTop = UI.logsContainer.scrollHeight;
}

function getLogClass(text) {
    if (text.toLowerCase().includes('error')) return 'error';
    if (text.toLowerCase().includes('success') || text.toLowerCase().includes('done')) return 'success';
    if (text.toLowerCase().includes('acting') || text.toLowerCase().includes('executing')) return 'acting';
    if (text.toLowerCase().includes('thought') || text.toLowerCase().includes('analyzing')) return 'thinking';
    return 'info';
}

function updateScreenshot(base64Data) {
    UI.browserOverlay.style.display = 'none';
    UI.liveScreenshot.style.display = 'block';
    // Add small timeout to ensure transition triggers
    requestAnimationFrame(() => {
        UI.liveScreenshot.classList.add('visible');
    });
    UI.liveScreenshot.src = base64Data;
}

function updateStatus(status) {
    if (status.toLowerCase() !== 'idle' && status.toLowerCase() !== 'done') {
        UI.statusIndicator.classList.add('running');
        UI.startBtn.classList.add('hidden');
        UI.stopBtn.classList.remove('hidden');
        UI.instructionInput.disabled = true;
    } else {
        UI.statusIndicator.classList.remove('running');
        UI.startBtn.classList.remove('hidden');
        UI.stopBtn.classList.add('hidden');
        UI.instructionInput.disabled = false;

        if (status.toLowerCase() === 'done') {
            appendLog('Task completed or stopped.', 'info');
        }
    }
}

async function startTask() {
    const instruction = UI.instructionInput.value.trim();
    if (!instruction) return;

    appendMessage(instruction, 'user');
    UI.instructionInput.value = '';
    UI.instructionInput.style.height = 'auto'; // Reset size

    UI.browserOverlay.style.display = 'flex';
    UI.liveScreenshot.classList.remove('visible');
    UI.browserOverlay.querySelector('p').textContent = 'Initializing browser action...';

    try {
        const response = await fetch('/api/gravity/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instruction })
        });

        const data = await response.json();
        if (!response.ok) {
            appendMessage(`Error: ${data.message}`, 'system');
            appendLog(`Error: ${data.message}`, 'error');
        } else {
            appendLog('Task initialized.', 'success');
        }
    } catch (err) {
        console.error(err);
        appendMessage('Failed to connect to backend api.', 'system');
        appendLog('Connection failed', 'error');
    }
}

async function stopTask() {
    try {
        await fetch('/api/gravity/stop', { method: 'POST' });
        appendLog('Stop command sent.', 'error');
        appendMessage('Stopping task execution.', 'system');
    } catch (err) {
        console.error(err);
    }
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Event Listeners
UI.startBtn.addEventListener('click', startTask);
UI.stopBtn.addEventListener('click', stopTask);

UI.instructionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        startTask();
    }
});

// Sidebar shortcuts
document.addEventListener('keydown', (e) => {
    // Esc to close sidebar
    if (e.key === 'Escape' && UI.sidebar.classList.contains('active')) {
        UI.sidebar.classList.remove('active');
    }
    // Ctrl/Cmd + / to toggle sidebar 
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        UI.sidebar.classList.toggle('active');
        if (UI.sidebar.classList.contains('active')) {
            UI.instructionInput.focus();
        }
    }
});

// Init
connectWebSocket();
