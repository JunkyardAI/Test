// --- MODULE: CORE (Global State & Utils) ---

// 1. Global Icon Library
window.GOOGLE_ICONS = [
    "folder", "description", "article", "code", "terminal", "settings", "home",
    "search", "delete", "edit", "save", "download", "upload", "image", "movie",
    "music_note", "grid_view", "list", "check", "close", "menu", "refresh",
    "arrow_back", "arrow_forward", "star", "favorite", "bug_report", "memory",
    "storage", "cloud", "cloud_upload", "wifi", "battery_full", "laptop",
    "desktop_windows", "phone_iphone", "keyboard", "mouse", "monitor",
    "developer_board", "router", "cast", "videogame_asset", "lightbulb",
    "bolt", "palette", "brush", "construction", "build", "handyman",
    "science", "school", "rocket", "flight", "local_shipping", "map",
    "place", "person", "group", "pets", "eco", "spa", "water_drop",
    "fire_extinguisher", "warning", "info", "help", "lock", "lock_open",
    "vpn_key", "security", "shield", "policy", "history", "schedule",
    "calendar_today", "calculate", "attach_money", "shopping_cart", "credit_card"
];

// 2. Icon Renderer
window.renderIconHtml = function(iconUrl, classes = "") {
    if (!iconUrl) return `<span class="material-symbols-outlined ${classes}">grid_view</span>`;
    
    const isGoogleIcon = /^[a-z0-9_]+$/.test(iconUrl);
    
    if (isGoogleIcon) {
        return `<span class="material-symbols-outlined ${classes}">${iconUrl}</span>`;
    } else {
        return `<img src="${iconUrl}" class="${classes} object-contain" onerror="this.style.display='none'">`;
    }
};

// 3. Notification System
window.notify = function(msg, isErr = false) {
    const el = document.getElementById('notification');
    if (!el) {
        console.log(`[${isErr ? 'ERR' : 'INFO'}] ${msg}`);
        return;
    }
    el.innerHTML = `<div class="flex items-center gap-3">
        <span class="material-symbols-outlined">${isErr ? 'error' : 'check_circle'}</span>
        <span>${msg}</span>
    </div>`;
    el.className = `fixed top-6 right-6 px-4 py-3 rounded-lg shadow-xl text-sm font-medium z-[100000] text-white animate-slideIn ${isErr ? 'bg-red-600' : 'bg-blue-600'}`;
    el.classList.remove('hidden');
    
    if (window._notifyTimer) clearTimeout(window._notifyTimer);
    window._notifyTimer = setTimeout(() => {
        el.classList.add('hidden');
    }, 3000);
};

// 4. File Path Utilities
window.normalizePath = function(p) {
    if(!p) return "";
    // Replace backslashes, remove leading slashes and dots
    return p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
};

// 5. Escaping
window.esc = function(unsafe) {
    if (!unsafe) return "";
    if (typeof unsafe !== 'string') return String(unsafe);
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
};
