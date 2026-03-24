const fs = require('fs');
const path = require('path');
const appData = path.join(process.env.APPDATA || (process.env.USERPROFILE + '/AppData/Roaming'), 'endless-browser', 'storage');
const fileConfig = path.join(appData, 'endless_settings.json');

let settings = { 
    homePage: 'https://www.google.com', 
    searchEngine: 'google', 
    backendUrl: 'http://localhost:8082', 
    autoOpen: false 
};

try {
    if (fs.existsSync(fileConfig)) {
        settings = JSON.parse(fs.readFileSync(fileConfig, 'utf8'));
    }
} catch (e) {
    console.error('Error reading settings:', e);
}

settings.geminiKey = 'AIzaSyCze3aifqlaMpJjpq03Hd71U7BSKChotvM';

try {
    if (!fs.existsSync(appData)) {
        fs.mkdirSync(appData, { recursive: true });
    }
    fs.writeFileSync(fileConfig, JSON.stringify(settings, null, 2));
    console.log('Gemini API Key successfully saved to storage.');
} catch (e) {
    console.error('Error saving settings:', e);
}
