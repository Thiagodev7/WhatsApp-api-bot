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
    agenda: document.getElementById('agenda-timeline'), 
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
    
    if(btn) {
        btn.classList.add('active');
        // CORREÇÃO DE TÍTULO: Pega o texto correto do botão
        const title = btn.querySelector('span:last-child')?.innerText || btn.innerText;
        document.getElementById('page-title').innerText = title;
    } else {
        document.getElementById('page-title').innerText = 'Dashboard';
    }
    
    if(id === 'home' || id === 'agenda') refreshData();
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
    
    // ATUALIZA A LISTA RECENTE (HOME) COM O NOVO DESIGN
    els.recent.innerHTML = '';
    
    apps.slice(0, 6).forEach(a => {
        const d = new Date(a.start);
        
        const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
        const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const parts = (a.summary || "Serviço - Cliente").split('-');
        const servico = parts[0]?.trim();
        const cliente = parts[1]?.trim() || "Cliente";
        const inicial = cliente.charAt(0).toUpperCase();

        els.recent.innerHTML += `
        <div class="dashboard-card">
            <div class="card-icon">${inicial}</div>
            <div class="card-info">
                <h4>${cliente}</h4>
                <p>
                    <span class="material-icons-round" style="font-size:14px; color:var(--primary);">event</span>
                    ${dia} às ${hora}
                </p>
            </div>
            <div class="card-badge">${servico}</div>
        </div>`;
    });
    
    if(apps.length === 0) {
        els.recent.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">Nenhum cliente próximo.</p>';
    }

    if(!apps.length) { els.agenda.innerHTML = '<div style="text-align:center;color:#999;padding:40px">Agenda vazia</div>'; return; }

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

// --- CONFIGURAÇÕES INTELIGENTES (NOVO) ---

const SPECIAL_KEYS = ['config_inicio', 'config_fim', 'config_duracao', 'config_prompt'];

socket.on('knowledge_update', d => {
    const listEl = document.getElementById('config-list');
    listEl.innerHTML = ''; 

    // 1. Preenche os campos Especiais (Bonitos)
    if (d['config_inicio']) document.getElementById('setting-inicio').value = d['config_inicio'];
    if (d['config_fim']) document.getElementById('setting-fim').value = d['config_fim'];
    if (d['config_duracao']) document.getElementById('setting-duracao').value = d['config_duracao'];
    if (d['config_prompt']) document.getElementById('setting-prompt').value = d['config_prompt'];

    // 2. Preenche a lista genérica com o resto
    Object.keys(d).forEach(k => {
        if (!SPECIAL_KEYS.includes(k)) {
            const item = document.createElement('div');
            item.className = 'mini-item';
            item.innerHTML = `
                <div>
                    <span class="mini-key">${k}</span>: 
                    <span class="mini-val">${d[k]}</span>
                </div>
                <button class="btn-icon" onclick="delConf('${k}')">
                    <span class="material-icons-round" style="font-size:16px">close</span>
                </button>
            `;
            listEl.appendChild(item);
        }
    });
});

// Salva Agenda ou IA
function saveSpecialSettings(type) {
    if (type === 'agenda') {
        const inicio = document.getElementById('setting-inicio').value;
        const fim = document.getElementById('setting-fim').value;
        const duracao = document.getElementById('setting-duracao').value;

        if(inicio) socket.emit('add_knowledge', { key: 'config_inicio', value: inicio });
        if(fim) socket.emit('add_knowledge', { key: 'config_fim', value: fim });
        if(duracao) socket.emit('add_knowledge', { key: 'config_duracao', value: duracao });
    }
    
    if (type === 'ia') {
        const prompt = document.getElementById('setting-prompt').value;
        if(prompt) socket.emit('add_knowledge', { key: 'config_prompt', value: prompt });
    }
    
    showToast();
}

// Salva itens genéricos (preço, dúvidas)
function saveGenericConfig() { 
    const k = document.getElementById('cfg-key').value.trim();
    const v = document.getElementById('cfg-val').value.trim();
    
    if(!k || !v) return alert("Preencha nome e resposta");

    socket.emit('add_knowledge', { key: k, value: v }); 
    
    document.getElementById('cfg-key').value = '';
    document.getElementById('cfg-val').value = '';
    showToast(); 
}

function delConf(k) { 
    if(confirm('Remover "' + k + '"?')) socket.emit('delete_knowledge', k); 
}

function disconnectWhatsapp() { if(confirm('Desconectar e limpar sessão?')) socket.emit('logout'); }
function logout() { if(confirm('Reiniciar o sistema?')) socket.emit('logout'); }

function showToast() { 
    const t = document.getElementById('toast'); 
    t.classList.add('show'); 
    setTimeout(()=>t.classList.remove('show'), 2000); 
}

refreshData();