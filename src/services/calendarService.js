// src/services/calendarService.js
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

// escopo: acesso ao calendário
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// caminhos dos arquivos de credencial e token
// 👇 TROCA esse nome pelo nome exato do JSON que você baixou do Google Cloud
// (o mesmo que você já está usando e que funcionou)
const CREDENTIALS_PATH = path.join(
  process.cwd(),
  'client_secret_407609422133-r7bc2bd01fpth5u7siqnik0o80qm7hpk.apps.googleusercontent.com.json'
);
const TOKEN_PATH = path.join(process.cwd(), 'token.json');

let cachedClient = null;

// carrega credenciais salvas (token)
async function loadSavedCredentialsIfExist() {
  try {
    const content = fs.readFileSync(TOKEN_PATH, 'utf8');
  const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

// salva token após primeira autenticação
async function saveCredentials(client) {
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = {
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(payload));
}

// obtém client autenticado (faz fluxo OAuth na primeira vez)
async function getAuthClient() {
  if (cachedClient) return cachedClient;

  let client = await loadSavedCredentialsIfExist();
  if (client) {
    cachedClient = client;
    return client;
  }

  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const keys = JSON.parse(content);
  const { client_secret, client_id, redirect_uris } = keys.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('🔐 Autorize este app acessando este link:');
  console.log(authUrl);
  console.log('\nDepois de autorizar, cole aqui o "code" da URL:');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const code = await new Promise((resolve) =>
    rl.question('Code: ', (answer) => {
      rl.close();
      resolve(answer);
    })
  );

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  await saveCredentials(oAuth2Client);
  cachedClient = oAuth2Client;
  return oAuth2Client;
}

// cria um agendamento no calendário
async function createAppointment({ summary, description, startDateTime, endDateTime }) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const event = {
    summary,
    description,
    start: {
      dateTime: startDateTime,
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'America/Sao_Paulo',
    },
  };

  const response = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: event,
  });

  return response.data;
}

// 🔹 Busca horários disponíveis em um dia
// date: string no formato YYYY-MM-DD
async function getAvailableSlots(date, options = {}) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const {
    slotMinutes = 40,     // duração de cada atendimento
    workStart = '09:00',  // início do expediente
    workEnd = '18:00',    // fim do expediente
  } = options;

  const toIsoWithOffset = (d, time) =>
    new Date(`${d}T${time}:00-03:00`).toISOString();

  const timeMin = toIsoWithOffset(date, '00:00');
  const timeMax = toIsoWithOffset(date, '23:59');

  const res = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];

  const busy = events
    .filter((ev) => ev.start && ev.end)
    .map((ev) => {
      const start = ev.start.dateTime || ev.start.date;
      const end = ev.end.dateTime || ev.end.date;
      return {
        start: new Date(start),
        end: new Date(end),
      };
    });

  const parseTime = (d, t) => new Date(`${d}T${t}:00-03:00`);

  let cursor = parseTime(date, workStart);
  const endOfDay = parseTime(date, workEnd);

  const slots = [];

  while (cursor < endOfDay) {
    const slotStart = new Date(cursor.getTime());
    const slotEnd = new Date(cursor.getTime() + slotMinutes * 60000);

    const hasConflict = busy.some(
      (b) => slotStart < b.end && slotEnd > b.start
    );

    if (!hasConflict) {
      const hh = String(slotStart.getHours()).padStart(2, '0');
      const mm = String(slotStart.getMinutes()).padStart(2, '0');
      slots.push(`${hh}:${mm}`);
    }

    cursor = slotEnd;
  }

  return slots;
}

module.exports = {
  createAppointment,
  getAvailableSlots,
};