// --- MODULE: SETTINGS (Universal Settings System) ---
// Shared settings across all apps and projects
// Supports user-level, app-level, and project-level settings

window.Settings = {
    // Internal cache
    _cache: {},
    _initialized: false,
    
    // Setting scopes
    SCOPES: {
        USER: 'user',
        APP: 'app',
        PROJECT: 'project',
        SYSTEM: 'system'
    },
    
    /**
     * Initialize settings system
     */
    init: async function() {
        if (this._initialized) return;
        
        // Ensure DB is initialized
        if (window.DB) {
            await window.DB.init();
        }
        
        // Load default settings
        await this._loadDefaults();
        
        // Load cached settings
        await this._loadCache();
        
        this._initialized = true;
        
        if (window.Debugger) {
            window.Debugger.log('settings', 'Settings system initialized');
        }
    },
    
    /**
     * Load default system settings
     */
    _loadDefaults: async function() {
        const defaults = {
            'system.theme': { value: 'dark', scope: this.SCOPES.SYSTEM },
            'system.language': { value: 'en', scope: this.SCOPES.SYSTEM },
            'system.debug': { value: false, scope: this.SCOPES.SYSTEM },
            'ui.animations': { value: true, scope: this.SCOPES.USER },
            'ui.fontSize': { value: 14, scope: this.SCOPES.USER },
            'editor.tabSize': { value: 2, scope: this.SCOPES.USER },
            'editor.wordWrap': { value: true, scope: this.SCOPES.USER },
            'editor.autoSave': { value: true, scope: this.SCOPES.USER },
            'export.minify': { value: false, scope: this.SCOPES.USER },
            'export.inlineAssets': { value: false, scope: this.SCOPES.USER }
        };
        
        for (const key in defaults) {
            const existing = await this._getRaw(key);
            if (!existing) {
                await this._setRaw(key, defaults[key].value, defaults[key].scope);
            }
        }
    },
    
    /**
     * Load settings cache from DB
     */
    _loadCache: async function() {
        try {
            if (!window.DB || !window.DB.init) return;
            
            // This would require a getAll method on settings store
            // For now, we'll load on-demand
            this._cache = {};
        } catch (e) {
            if (window.Debugger) {
                window.Debugger.logError('Settings cache load failed', e);
            }
        }
    },
    
    /**
     * Get a setting value
     * @param {string} key Setting key (e.g., 'editor.tabSize')
     * @param {*} defaultValue Default value if not found
     * @param {string} scope Optional scope override
     * @returns {Promise<*>} Setting value
     */
    get: async function(key, defaultValue = null, scope = null) {
        await this.init();
        
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'system.settings.read',
                target: key,
                context: { scope }
            });
            
            if (!result.allowed) {
                if (window.Debugger) {
                    window.Debugger.logWarning(`Settings read denied: ${key}`, { reason: result.reason });
                }
                return defaultValue;
            }
        }
        
        // Check cache first
        if (this._cache[key] !== undefined) {
            return this._cache[key];
        }
        
        // Load from DB
        const setting = await this._getRaw(key, scope);
        
        if (setting) {
            this._cache[key] = setting.value;
            return setting.value;
        }
        
        return defaultValue;
    },
    
    /**
     * Set a setting value
     * @param {string} key Setting key
     * @param {*} value Setting value
     * @param {string} scope Setting scope (user, app, project, system)
     * @returns {Promise<boolean>} Success
     */
    set: async function(key, value, scope = null) {
        await this.init();
        
        // Determine scope if not provided
        if (!scope) {
            scope = this._determineScope(key);
        }
        
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'system.settings.write',
                target: key,
                context: { scope, value }
            });
            
            if (!result.allowed) {
                if (window.Debugger) {
                    window.Debugger.logError(`Settings write denied: ${key}`, null, { reason: result.reason });
                }
                throw new Error(`Settings write denied: ${result.reason}`);
            }
        }
        
        // Validate system settings can't be changed
        if (scope === this.SCOPES.SYSTEM && key.startsWith('system.')) {
            const existing = await this._getRaw(key);
            if (existing && existing.scope === this.SCOPES.SYSTEM) {
                if (window.Debugger) {
                    window.Debugger.logWarning(`Cannot modify system setting: ${key}`);
                }
                return false;
            }
        }
        
        // Save to DB
        await this._setRaw(key, value, scope);
        
        // Update cache
        this._cache[key] = value;
        
        // Emit change event
        this._emitChange(key, value, scope);
        
        if (window.Debugger) {
            window.Debugger.logStateChange('settings', key, this._cache[key], value);
        }
        
        return true;
    },
    
    /**
     * Delete a setting
     * @param {string} key Setting key
     * @returns {Promise<boolean>} Success
     */
    delete: async function(key) {
        await this.init();
        
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'system.settings.write',
                target: key,
                context: { operation: 'delete' }
            });
            
            if (!result.allowed) {
                throw new Error(`Settings delete denied: ${result.reason}`);
            }
        }
        
        // Prevent deletion of system settings
        const existing = await this._getRaw(key);
        if (existing && existing.scope === this.SCOPES.SYSTEM) {
            if (window.Debugger) {
                window.Debugger.logWarning(`Cannot delete system setting: ${key}`);
            }
            return false;
        }
        
        // Delete from DB
        await this._deleteRaw(key);
        
        // Remove from cache
        delete this._cache[key];
        
        return true;
    },
    
    /**
     * Get all settings for a scope
     * @param {string} scope
     * @returns {Promise<object>} Settings object
     */
    getAll: async function(scope = null) {
        await this.init();
        
        // This would require a getAll method on settings store
        // For now, return cached settings filtered by scope
        const settings = {};
        
        for (const key in this._cache) {
            const setting = await this._getRaw(key);
            if (setting && (!scope || setting.scope === scope)) {
                settings[key] = setting.value;
            }
        }
        
        return settings;
    },
    
    /**
     * Get setting with metadata
     * @param {string} key
     * @returns {Promise<object|null>} {key, value, scope, modified}
     */
    getMeta: async function(key) {
        await this.init();
        return await this._getRaw(key);
    },
    
    /**
     * Reset settings to defaults
     * @param {string} scope Optional scope filter
     * @returns {Promise}
     */
    reset: async function(scope = null) {
        await this.init();
        
        // Get all settings
        const allSettings = await this.getAll(scope);
        
        // Delete non-system settings
        for (const key in allSettings) {
            if (!key.startsWith('system.')) {
                await this.delete(key);
            }
        }
        
        // Reload defaults
        await this._loadDefaults();
        
        // Clear cache
        this._cache = {};
        
        if (window.Debugger) {
            window.Debugger.log('settings', `Settings reset`, { scope });
        }
    },
    
    // ============================================
    // Private Methods
    // ============================================
    
    /**
     * Get raw setting from DB
     * @param {string} key
     * @param {string} scope
     * @returns {Promise<object|null>}
     */
    _getRaw: async function(key, scope = null) {
        if (!window.DB || !window.DB.init) {
            // Fallback to localStorage
            try {
                const stored = localStorage.getItem(`fb_setting_${key}`);
                if (stored) {
                    return JSON.parse(stored);
                }
            } catch (e) {
                // Ignore
            }
            return null;
        }
        
        try {
            // Access DB instance through window.DB
            // We need to use IndexedDB directly since DB module doesn't expose raw access
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('fb_builder_v1', 2);
                
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction(['settings'], 'readonly');
                    const store = tx.objectStore('settings');
                    const req = store.get(key);
                    
                    req.onsuccess = () => {
                        db.close();
                        resolve(req.result || null);
                    };
                    req.onerror = () => {
                        db.close();
                        resolve(null);
                    };
                };
                
                request.onerror = () => resolve(null);
            });
        } catch (e) {
            // Fallback to localStorage
            try {
                const stored = localStorage.getItem(`fb_setting_${key}`);
                if (stored) {
                    return JSON.parse(stored);
                }
            } catch (e2) {
                // Ignore
            }
            return null;
        }
    },
    
    /**
     * Set raw setting in DB
     * @param {string} key
     * @param {*} value
     * @param {string} scope
     * @returns {Promise}
     */
    _setRaw: async function(key, value, scope) {
        if (!window.DB || !window.DB.init) {
            // Fallback to localStorage
            try {
                localStorage.setItem(`fb_setting_${key}`, JSON.stringify({
                    key,
                    value,
                    scope,
                    modified: window.Utils ? window.Utils.now() : Date.now()
                }));
            } catch (e) {
                // Ignore quota errors
            }
            return;
        }
        
        try {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('fb_builder_v1', 2);
                
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction(['settings'], 'readwrite');
                    const store = tx.objectStore('settings');
                    
                    const setting = {
                        key,
                        value,
                        scope,
                        modified: window.Utils ? window.Utils.now() : Date.now()
                    };
                    
                    const req = store.put(setting);
                    
                    req.onsuccess = () => {
                        db.close();
                        resolve();
                    };
                    req.onerror = () => {
                        db.close();
                        // Fallback to localStorage
                        try {
                            localStorage.setItem(`fb_setting_${key}`, JSON.stringify(setting));
                            resolve();
                        } catch (e) {
                            reject(req.error);
                        }
                    };
                };
                
                request.onerror = () => {
                    // Fallback to localStorage
                    try {
                        localStorage.setItem(`fb_setting_${key}`, JSON.stringify({
                            key,
                            value,
                            scope,
                            modified: window.Utils ? window.Utils.now() : Date.now()
                        }));
                        resolve();
                    } catch (e) {
                        reject(new Error('Settings save failed'));
                    }
                };
            });
        } catch (e) {
            // Fallback to localStorage
            try {
                localStorage.setItem(`fb_setting_${key}`, JSON.stringify({
                    key,
                    value,
                    scope,
                    modified: window.Utils ? window.Utils.now() : Date.now()
                }));
            } catch (e2) {
                // Ignore quota errors
            }
        }
    },
    
    /**
     * Delete raw setting from DB
     * @param {string} key
     * @returns {Promise}
     */
    _deleteRaw: async function(key) {
        if (!window.DB || !window.DB.init) {
            // Fallback to localStorage
            localStorage.removeItem(`fb_setting_${key}`);
            return;
        }
        
        try {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open('fb_builder_v1', 2);
                
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction(['settings'], 'readwrite');
                    const store = tx.objectStore('settings');
                    const req = store.delete(key);
                    
                    req.onsuccess = () => {
                        db.close();
                        localStorage.removeItem(`fb_setting_${key}`);
                        resolve();
                    };
                    req.onerror = () => {
                        db.close();
                        localStorage.removeItem(`fb_setting_${key}`);
                        resolve();
                    };
                };
                
                request.onerror = () => {
                    localStorage.removeItem(`fb_setting_${key}`);
                    resolve();
                };
            });
        } catch (e) {
            // Fallback to localStorage
            localStorage.removeItem(`fb_setting_${key}`);
        }
    },
    
    /**
     * Determine scope from key
     * @param {string} key
     * @returns {string} Scope
     */
    _determineScope: function(key) {
        if (key.startsWith('system.')) return this.SCOPES.SYSTEM;
        if (key.startsWith('app.')) return this.SCOPES.APP;
        if (key.startsWith('project.')) return this.SCOPES.PROJECT;
        return this.SCOPES.USER;
    },
    
    /**
     * Emit setting change event
     * @param {string} key
     * @param {*} value
     * @param {string} scope
     */
    _emitChange: function(key, value, scope) {
        // Dispatch custom event
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('settings:change', {
                detail: { key, value, scope }
            }));
        }
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.Settings.init());
} else {
    window.Settings.init();
}

