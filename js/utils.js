// --- MODULE: UTILS (Pure Functions Only) ---
// NO SIDE EFFECTS ALLOWED
// This module contains only pure, deterministic functions

window.Utils = {
    // ============================================
    // ID Generation & Hashing
    // ============================================
    
    /**
     * Generate a UUID v4
     * @returns {string} UUID
     */
    uuid: function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },
    
    /**
     * Generate a short ID (8 chars)
     * @returns {string} Short ID
     */
    shortId: function() {
        return Math.random().toString(36).substring(2, 10);
    },
    
    /**
     * Hash a string to a number
     * @param {string} str
     * @returns {number} Hash value
     */
    hash: function(str) {
        if (!str) return 0;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    },
    
    /**
     * Create a deterministic ID from a string
     * @param {string} str
     * @returns {string} Deterministic ID
     */
    deterministicId: function(str) {
        return 'id-' + this.hash(str).toString(36);
    },
    
    // ============================================
    // String Utilities
    // ============================================
    
    /**
     * Escape HTML entities
     * @param {string} unsafe
     * @returns {string} Escaped string
     */
    escapeHtml: function(unsafe) {
        if (!unsafe) return "";
        if (typeof unsafe !== 'string') return String(unsafe);
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },
    
    /**
     * Normalize file path (cross-platform)
     * @param {string} path
     * @returns {string} Normalized path
     */
    normalizePath: function(path) {
        if (!path) return "";
        return path
            .replace(/\\/g, '/')           // Backslashes to forward slashes
            .replace(/^\/+/, '')           // Remove leading slashes
            .replace(/^\.\//, '')          // Remove leading ./
            .replace(/\/+/g, '/')          // Collapse multiple slashes
            .replace(/\/$/, '');           // Remove trailing slash (unless root)
    },
    
    /**
     * Get file extension
     * @param {string} path
     * @returns {string} Extension (lowercase, no dot)
     */
    getExtension: function(path) {
        if (!path) return "";
        const parts = path.split('.');
        return parts.length > 1 ? parts.pop().toLowerCase() : "";
    },
    
    /**
     * Get directory path from file path
     * @param {string} path
     * @returns {string} Directory path
     */
    getDirname: function(path) {
        if (!path) return "";
        const normalized = this.normalizePath(path);
        const lastSlash = normalized.lastIndexOf('/');
        return lastSlash === -1 ? "" : normalized.substring(0, lastSlash);
    },
    
    /**
     * Get filename from path
     * @param {string} path
     * @returns {string} Filename
     */
    getBasename: function(path) {
        if (!path) return "";
        const normalized = this.normalizePath(path);
        const lastSlash = normalized.lastIndexOf('/');
        return lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1);
    },
    
    /**
     * Join path segments
     * @param {...string} segments
     * @returns {string} Joined path
     */
    joinPath: function(...segments) {
        return segments
            .filter(s => s)
            .map(s => this.normalizePath(s))
            .join('/')
            .replace(/\/+/g, '/');
    },
    
    /**
     * Check if path is absolute
     * @param {string} path
     * @returns {boolean}
     */
    isAbsolutePath: function(path) {
        return path && (path.startsWith('/') || /^[A-Z]:/.test(path));
    },
    
    /**
     * Resolve relative path from base
     * @param {string} basePath
     * @param {string} relativePath
     * @returns {string} Resolved path
     */
    resolvePath: function(basePath, relativePath) {
        if (this.isAbsolutePath(relativePath)) return this.normalizePath(relativePath);
        
        const base = this.normalizePath(basePath);
        const relative = this.normalizePath(relativePath);
        
        const baseParts = base.split('/').filter(p => p);
        const relParts = relative.split('/').filter(p => p);
        
        // Remove filename from base if it exists
        if (baseParts.length > 0 && baseParts[baseParts.length - 1].includes('.')) {
            baseParts.pop();
        }
        
        for (const part of relParts) {
            if (part === '.') continue;
            if (part === '..') {
                if (baseParts.length > 0) baseParts.pop();
            } else {
                baseParts.push(part);
            }
        }
        
        return baseParts.join('/');
    },
    
    // ============================================
    // Object Utilities
    // ============================================
    
    /**
     * Deep clone an object
     * @param {*} obj
     * @returns {*} Cloned object
     */
    deepClone: function(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const cloned = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    cloned[key] = this.deepClone(obj[key]);
                }
            }
            return cloned;
        }
        return obj;
    },
    
    /**
     * Deep freeze an object (immutable)
     * @param {*} obj
     * @returns {*} Frozen object
     */
    deepFreeze: function(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        
        Object.freeze(obj);
        
        Object.getOwnPropertyNames(obj).forEach(prop => {
            if (obj[prop] !== null && typeof obj[prop] === 'object' && !Object.isFrozen(obj[prop])) {
                this.deepFreeze(obj[prop]);
            }
        });
        
        return obj;
    },
    
    /**
     * Check if two objects are deeply equal
     * @param {*} a
     * @param {*} b
     * @returns {boolean}
     */
    deepEqual: function(a, b) {
        if (a === b) return true;
        if (a === null || b === null) return false;
        if (typeof a !== 'object' || typeof b !== 'object') return false;
        
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        
        if (keysA.length !== keysB.length) return false;
        
        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!this.deepEqual(a[key], b[key])) return false;
        }
        
        return true;
    },
    
    /**
     * Merge objects deeply
     * @param {object} target
     * @param {...object} sources
     * @returns {object} Merged object
     */
    deepMerge: function(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();
        
        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }
        
        return this.deepMerge(target, ...sources);
    },
    
    /**
     * Check if value is a plain object
     * @param {*} val
     * @returns {boolean}
     */
    isObject: function(val) {
        return val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date);
    },
    
    // ============================================
    // Geometry & Layout
    // ============================================
    
    /**
     * Calculate distance between two points
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @returns {number} Distance
     */
    distance: function(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    },
    
    /**
     * Check if point is inside rectangle
     * @param {number} x
     * @param {number} y
     * @param {object} rect {x, y, width, height}
     * @returns {boolean}
     */
    pointInRect: function(x, y, rect) {
        return x >= rect.x && 
               x <= rect.x + rect.width && 
               y >= rect.y && 
               y <= rect.y + rect.height;
    },
    
    /**
     * Check if two rectangles intersect
     * @param {object} rect1 {x, y, width, height}
     * @param {object} rect2 {x, y, width, height}
     * @returns {boolean}
     */
    rectIntersect: function(rect1, rect2) {
        return !(rect1.x + rect1.width < rect2.x ||
                 rect2.x + rect2.width < rect1.x ||
                 rect1.y + rect1.height < rect2.y ||
                 rect2.y + rect2.height < rect1.y);
    },
    
    /**
     * Clamp value between min and max
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {number} Clamped value
     */
    clamp: function(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },
    
    /**
     * Linear interpolation
     * @param {number} a
     * @param {number} b
     * @param {number} t (0-1)
     * @returns {number}
     */
    lerp: function(a, b, t) {
        return a + (b - a) * this.clamp(t, 0, 1);
    },
    
    /**
     * Normalize value from one range to another
     * @param {number} value
     * @param {number} min1
     * @param {number} max1
     * @param {number} min2
     * @param {number} max2
     * @returns {number} Normalized value
     */
    normalize: function(value, min1, max1, min2, max2) {
        const normalized = (value - min1) / (max1 - min1);
        return min2 + normalized * (max2 - min2);
    },
    
    // ============================================
    // Array Utilities
    // ============================================
    
    /**
     * Remove duplicates from array
     * @param {Array} arr
     * @returns {Array} Unique array
     */
    unique: function(arr) {
        return [...new Set(arr)];
    },
    
    /**
     * Group array by key
     * @param {Array} arr
     * @param {string|function} keyFn
     * @returns {object} Grouped object
     */
    groupBy: function(arr, keyFn) {
        const key = typeof keyFn === 'function' ? keyFn : (item) => item[keyFn];
        return arr.reduce((groups, item) => {
            const k = key(item);
            if (!groups[k]) groups[k] = [];
            groups[k].push(item);
            return groups;
        }, {});
    },
    
    /**
     * Sort array by key
     * @param {Array} arr
     * @param {string|function} keyFn
     * @param {boolean} descending
     * @returns {Array} Sorted array
     */
    sortBy: function(arr, keyFn, descending = false) {
        const key = typeof keyFn === 'function' ? keyFn : (item) => item[keyFn];
        const sorted = [...arr].sort((a, b) => {
            const aVal = key(a);
            const bVal = key(b);
            if (aVal < bVal) return descending ? 1 : -1;
            if (aVal > bVal) return descending ? -1 : 1;
            return 0;
        });
        return sorted;
    },
    
    // ============================================
    // Validation
    // ============================================
    
    /**
     * Check if value is valid UUID
     * @param {string} str
     * @returns {boolean}
     */
    isUUID: function(str) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
    },
    
    /**
     * Check if value is valid email
     * @param {string} str
     * @returns {boolean}
     */
    isEmail: function(str) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
    },
    
    /**
     * Check if value is valid URL
     * @param {string} str
     * @returns {boolean}
     */
    isURL: function(str) {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    },
    
    /**
     * Sanitize filename
     * @param {string} filename
     * @returns {string} Sanitized filename
     */
    sanitizeFilename: function(filename) {
        return filename
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/^\.+/, '')
            .replace(/\.+$/, '')
            .substring(0, 255);
    },
    
    // ============================================
    // Time Utilities
    // ============================================
    
    /**
     * Get current timestamp
     * @returns {number} Unix timestamp (ms)
     */
    now: function() {
        return Date.now();
    },
    
    /**
     * Format timestamp to ISO string
     * @param {number} timestamp
     * @returns {string} ISO string
     */
    toISO: function(timestamp) {
        return new Date(timestamp).toISOString();
    },
    
    /**
     * Format relative time
     * @param {number} timestamp
     * @returns {string} Relative time string
     */
    relativeTime: function(timestamp) {
        const now = this.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'just now';
    }
};

// Backward compatibility aliases (will be deprecated)
window.normalizePath = window.Utils.normalizePath.bind(window.Utils);
window.esc = window.Utils.escapeHtml.bind(window.Utils);

