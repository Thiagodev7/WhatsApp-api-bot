const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'appointments.json');

function loadDb() {
    if (!fs.existsSync(DB_PATH)) return [];
    try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch (e) { return []; }
}

function saveDb(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

async function getAvailableSlots(dateIso, options = {}) {
    const { slotMinutes = 40, workStart = '09:00', workEnd = '19:00' } = options;
    const appointments = loadDb();
    
    const dayApps = appointments.filter(app => app.start.startsWith(dateIso));
    const slots = [];
    let current = new Date(`${dateIso}T${workStart}:00`);
    const endOfDay = new Date(`${dateIso}T${workEnd}:00`);

    while (current < endOfDay) {
        const slotStart = new Date(current);
        const slotEnd = new Date(current.getTime() + slotMinutes * 60000);
        if (slotEnd > endOfDay) break;

        const isBusy = dayApps.some(app => {
            const appStart = new Date(app.start);
            const appEnd = new Date(app.end);
            return (slotStart < appEnd && slotEnd > appStart);
        });

        if (!isBusy) slots.push(slotStart.toTimeString().slice(0, 5));
        current = slotEnd;
    }
    return slots;
}

async function createAppointment({ summary, description, startDateTime, endDateTime }) {
    const appointments = loadDb();
    const newEvent = {
        id: Date.now().toString(),
        summary, description, start: startDateTime, end: endDateTime,
        createdAt: new Date().toISOString()
    };
    appointments.push(newEvent);
    saveDb(appointments);
    return newEvent;
}

function getAllAppointments() {
    return loadDb().sort((a, b) => new Date(a.start) - new Date(b.start));
}

function deleteAppointment(id) {
    let apps = loadDb();
    const initialLen = apps.length;
    apps = apps.filter(a => a.id !== id);
    saveDb(apps);
    return apps.length < initialLen;
}

module.exports = { getAvailableSlots, createAppointment, getAllAppointments, deleteAppointment };