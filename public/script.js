const socket = io();
const els = {
    chatFeed: document.getElementById('chat-feed'),
    contactList: document.getElementById('contact-list'),
    qr: document.getElementById('qr-overlay'),
    qrBox: document.getElementById('qr-box'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    totalApps: document.getElementById('total-apps'),
    totalMsgs: document.getElementById('total-msgs'),
    agenda: document.getElementById('agenda-timeline'), // Alterado para a timeline
    recent: document.getElementById('recent-list'),
    configs: document.getElementById('config-list')
};

// Estado do Chat
let conversations = {}; 
let activeChatId = null;
let msgCount = 0;

// --- NAVEGAÇÃO ---
function showTab(id, btn) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('view-'+id).classList.add('active');
    if(btn) btn.classList.add('active');
    
    if(id === 'home' || id === 'agenda') refreshData();
    document.getElementById('page-title').innerText = btn ? btn.innerText.trim() : 'Painel';
}

function authSettings(btn) {
    const p = prompt("Senha de Admin:");
    if(p) { socket.emit('auth_request', p); window.tempBtn = btn; }
}
socket.on('auth_success', () => { showTab('settings', window.tempBtn); socket.emit('request_knowledge'); });
socket.on('auth_fail', () => alert('Senha incorreta!'));

// --- SOCKETS GERAIS ---
socket.on('connect', () => setStatus(true));
socket.on('disconnect', () => setStatus(false));

function setStatus(online) {
    els.statusDot.style.background = online ? 'var(--success)' : 'var(--danger)';
    els.statusText.innerText = online ? 'Online' : 'Offline';
    els.statusText.style.color = online ? 'var(--success)' : 'var(--danger)';
}

socket.on('qr', src => {
    els.qr.style.display = 'flex'; els.qrBox.innerHTML = `<img src="${src}" style="width:100%">`;
    setStatus(false);
});
socket.on('ready', () => { els.qr.style.display='none'; setStatus(true); });

// --- SISTEMA DE CHAT INTELIGENTE ---
socket.on('log_history', lines => {
    conversations = {}; // Reinicia memória local
    lines.forEach(processLine);
    renderContacts();
});

socket.on('file_log', line => {
    const msg = processLine(line);
    if(msg) {
        renderContacts(); // Reordena lista
        if(activeChatId === msg.chatId) {
            renderMessage(msg); // Adiciona se aberto
            scrollToBottom(); // ROLA AUTOMATICAMENTE AQUI
        }
    }
});

function processLine(line) {
    const match = line.match(/^\[(.*?)\] \[(.*?)\] \[(.*?)\]: (.*)/);
    if(!match) return null;

    const [_, timeFull, type, contact, content] = match;
    const time = timeFull.split(' ')[1].substring(0, 5);
    const chatId = contact.replace('@c.us', '');

    if(['ADMIN', 'WARN', 'ERROR', 'BOOT', 'SUCCESS'].includes(type)) return null;

    const msg = {
        text: content,
        time: time,
        fromMe: type === 'RESPONDIDO'
    };

    if(!conversations[chatId]) conversations[chatId] = [];
    conversations[chatId].push(msg);

    if(type === 'RECEBIDO') {
        msgCount++;
        els.totalMsgs.innerText = msgCount;
    }

    return { ...msg, chatId };
}

function renderContacts() {
    els.contactList.innerHTML = '';
    const sortedIds = Object.keys(conversations).sort((a, b) => {
        const lastA = conversations[a][conversations[a].length - 1];
        const lastB = conversations[b][conversations[b].length - 1];
        return (lastB?.time || 0) > (lastA?.time || 0) ? 1 : -1; 
    });

    sortedIds.forEach(id => {
        const msgs = conversations[id];
        const last = msgs[msgs.length - 1];
        const active = id === activeChatId ? 'active' : '';
        
        const item = document.createElement('div');
        item.className = `contact-item ${active}`;
        item.onclick = () => loadChat(id);
        item.innerHTML = `
            <div class="avatar">${id.slice(-2)}</div>
            <div class="contact-info">
                <div style="display:flex;justify-content:space-between;">
                    <div class="contact-name">${id}</div>
                    <div class="contact-time">${last.time}</div>
                </div>
                <div class="contact-preview" style="color:${last.fromMe ? '#6366f1' : '#64748b'}">
                    ${last.fromMe ? 'Você: ' : ''}${last.text}
                </div>
            </div>
        `;
        els.contactList.appendChild(item);
    });
}

function loadChat(id) {
    activeChatId = id;
    renderContacts();
    
    document.getElementById('chat-header-bar').style.display = 'flex';
    document.getElementById('active-name').innerText = id;
    document.getElementById('active-avatar').innerText = id.slice(-2);
    
    const feed = els.chatFeed;
    feed.innerHTML = '';
    conversations[id].forEach(renderMessage);
    
    setTimeout(scrollToBottom, 50);
    
    if(window.innerWidth < 900) {
        document.querySelector('.chat-sidebar').style.display = 'none';
        document.querySelector('.chat-main').style.display = 'flex';
    }
}

function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = `bubble ${msg.fromMe ? 'out' : 'in'}`;
    div.innerHTML = `${msg.text}<span class="msg-time">${msg.time}</span>`;
    els.chatFeed.appendChild(div);
}

function scrollToBottom() {
    const feed = document.getElementById('chat-feed');
    if(feed) feed.scrollTop = feed.scrollHeight;
}

function closeChatMobile() {
    document.querySelector('.chat-sidebar').style.display = 'flex';
    document.querySelector('.chat-main').style.display = 'none';
    activeChatId = null;
}

function filterContacts(term) {
    const items = document.querySelectorAll('.contact-item');
    items.forEach(i => {
        const name = i.querySelector('.contact-name').innerText;
        i.style.display = name.includes(term) ? 'flex' : 'none';
    });
}

// --- AGENDA PRO LOGIC ---
function refreshData() { socket.emit('request_appointments'); }

socket.on('appointments_update', apps => {
    els.totalApps.innerText = apps.length;
    els.agenda.innerHTML = ''; 
    
    // Update Recent List (Home)
    els.recent.innerHTML = '';
    apps.slice(0, 4).forEach(a => {
        // Card Simples para Home
        const d = new Date(a.start);
        els.recent.innerHTML += `
        <div class="app-card" style="padding:15px">
            <div>
                <div style="font-weight:700">${(a.summary||"").split('-')[1] || "Cliente"}</div>
                <div style="font-size:0.8rem;color:var(--text-muted)">${d.getDate()}/${d.getMonth()+1} às ${d.getHours()}:${d.getMinutes()<10?'0':''}${d.getMinutes()}</div>
            </div>
        </div>`;
    });

    if(!apps.length) { els.agenda.innerHTML = '<div style="text-align:center;color:#999;padding:40px">Agenda vazia</div>'; return; }

    // Agrupar por Data
    const groups = {};
    apps.forEach(app => {
        const d = new Date(app.start).toLocaleDateString('pt-BR', {weekday:'long', day:'numeric', month:'long'});
        if(!groups[d]) groups[d] = [];
        groups[d].push(app);
    });

    Object.keys(groups).forEach(dateKey => {
        let html = `<div class="date-group"><div class="date-header"><span class="material-icons-round" style="font-size:18px">calendar_today</span> ${dateKey}</div>`;
        groups[dateKey].forEach(a => {
            const t = new Date(a.start);
            const timeStr = t.toLocaleTimeString([],{hour:'2-digit', minute:'2-digit'});
            const parts = (a.summary||"Serviço - Cliente").split('-');
            const service = parts[0]?.trim(); const client = parts[1]?.trim() || "Cliente";

            html += `
            <div class="schedule-card">
                <div class="time-col">
                    <div class="time-hour">${timeStr.split(':')[0]}</div>
                    <div class="time-ampm">:${timeStr.split(':')[1]}</div>
                </div>
                <div class="info-col">
                    <div class="client-name">${client}</div>
                    <div class="service-tag"><span class="material-icons-round" style="font-size:14px">content_cut</span> ${service}</div>
                </div>
                <div class="action-col">
                    <button class="btn-icon" onclick="delApp('${a.id}')">
                        <span class="material-icons-round">delete_outline</span>
                    </button>
                </div>
            </div>`;
        });
        html += `</div>`;
        els.agenda.innerHTML += html;
    });
});

function delApp(id) { if(confirm('Cancelar agendamento?')) socket.emit('delete_appointment', id); }

// CONFIGS
socket.on('knowledge_update', d => {
    els.configs.innerHTML = '';
    Object.keys(d).forEach(k => {
        els.configs.innerHTML += `<div class="config-item">
            <div><b>${k}</b><br><span style="font-size:0.8rem; color:var(--text-muted)">${d[k].substring(0,40)}...</span></div>
            <button class="btn-icon" onclick="delConf('${k}')"><span class="material-icons-round">delete</span></button>
        </div>`;
    });
});

function fill(k,v) { document.getElementById('cfg-key').value=k; document.getElementById('cfg-val').value=v; }
function saveConfig() { socket.emit('add_knowledge', {key:document.getElementById('cfg-key').value, value:document.getElementById('cfg-val').value}); showToast(); }
function delConf(k) { if(confirm('Apagar?')) socket.emit('delete_knowledge', k); }

function disconnectWhatsapp() { if(confirm('Desconectar?')) socket.emit('logout'); }
function logout() { if(confirm('Reiniciar?')) socket.emit('logout'); }
function showToast() { const t = document.getElementById('toast'); t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2000); }

refreshData();