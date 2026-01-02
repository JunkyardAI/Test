// --- MODULE: DEBUGGER (Passive Diagnostics) ---
// NO UI - Pure logging and diagnostics
// All events are captured for later analysis

window.Debugger = {
    // Internal state
    _enabled: true,
    _buffer: [],
    _maxBufferSize: 1000,
    _listeners: [],
    
    // Event types
    EVENT_TYPES: {
        RULE_DENIAL: 'rule.denial',
        RULE_ALLOW: 'rule.allow',
        RULE_MODIFY: 'rule.modify',
        CRASH: 'crash',
        ERROR: 'error',
        WARNING: 'warning',
        ACTION: 'action',
        STATE_CHANGE: 'state.change',
        WIDGET_EVENT: 'widget.event',
        DB_OP: 'db.operation',
        EXPORT: 'export',
        IMPORT: 'import'
    },
    
    /**
     * Initialize debugger
     */
    init: function() {
        this._enabled = true;
        this._buffer = [];
        this._listeners = [];
        
        // Capture unhandled errors
        window.addEventListener('error', (e) => {
            this.capture({
                type: this.EVENT_TYPES.CRASH,
                message: e.message,
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
                error: e.error ? e.error.toString() : null,
                stack: e.error ? e.error.stack : null,
                timestamp: window.Utils ? window.Utils.now() : Date.now()
            });
        });
        
        // Capture unhandled promise rejections
        window.addEventListener('unhandledrejection', (e) => {
            this.capture({
                type: this.EVENT_TYPES.ERROR,
                message: e.reason ? e.reason.toString() : 'Unhandled promise rejection',
                stack: e.reason && e.reason.stack ? e.reason.stack : null,
                timestamp: window.Utils ? window.Utils.now() : Date.now()
            });
        });
        
        this.log('debugger', 'Debugger initialized');
    },
    
    /**
     * Enable/disable debugger
     * @param {boolean} enabled
     */
    setEnabled: function(enabled) {
        this._enabled = enabled;
    },
    
    /**
     * Check if debugger is enabled
     * @returns {boolean}
     */
    isEnabled: function() {
        return this._enabled;
    },
    
    /**
     * Capture an event
     * @param {object} event Event object
     */
    capture: function(event) {
        if (!this._enabled) return;
        
        // Ensure event has required fields
        const fullEvent = {
            id: window.Utils ? window.Utils.uuid() : this._generateId(),
            timestamp: window.Utils ? window.Utils.now() : Date.now(),
            ...event
        };
        
        // Add to buffer
        this._buffer.push(fullEvent);
        
        // Limit buffer size
        if (this._buffer.length > this._maxBufferSize) {
            this._buffer.shift();
        }
        
        // Notify listeners
        this._listeners.forEach(listener => {
            try {
                listener(fullEvent);
            } catch (e) {
                console.error('Debugger listener error:', e);
            }
        });
        
        // Log to console in development
        if (this._isDevelopment()) {
            this._logToConsole(fullEvent);
        }
    },
    
    /**
     * Log a rule evaluation
     * @param {string} action
     * @param {string} target
     * @param {object} result {allowed, reason, modifiedAction}
     * @param {object} context
     */
    logRule: function(action, target, result, context = {}) {
        const type = result.allowed 
            ? this.EVENT_TYPES.RULE_ALLOW 
            : this.EVENT_TYPES.RULE_DENIAL;
        
        if (result.modifiedAction) {
            this.capture({
                type: this.EVENT_TYPES.RULE_MODIFY,
                action,
                target,
                originalAction: action,
                modifiedAction: result.modifiedAction,
                reason: result.reason,
                context,
                timestamp: window.Utils ? window.Utils.now() : Date.now()
            });
        } else {
            this.capture({
                type,
                action,
                target,
                allowed: result.allowed,
                reason: result.reason,
                context,
                timestamp: window.Utils ? window.Utils.now() : Date.now()
            });
        }
    },
    
    /**
     * Log an action
     * @param {string} action
     * @param {object} data
     */
    logAction: function(action, data = {}) {
        this.capture({
            type: this.EVENT_TYPES.ACTION,
            action,
            ...data,
            timestamp: window.Utils ? window.Utils.now() : Date.now()
        });
    },
    
    /**
     * Log an error
     * @param {string} message
     * @param {Error} error
     * @param {object} context
     */
    logError: function(message, error = null, context = {}) {
        this.capture({
            type: this.EVENT_TYPES.ERROR,
            message,
            error: error ? error.toString() : null,
            stack: error ? error.stack : null,
            ...context,
            timestamp: window.Utils ? window.Utils.now() : Date.now()
        });
    },
    
    /**
     * Log a warning
     * @param {string} message
     * @param {object} context
     */
    logWarning: function(message, context = {}) {
        this.capture({
            type: this.EVENT_TYPES.WARNING,
            message,
            ...context,
            timestamp: window.Utils ? window.Utils.now() : Date.now()
        });
    },
    
    /**
     * Log a state change
     * @param {string} component
     * @param {string} property
     * @param {*} oldValue
     * @param {*} newValue
     */
    logStateChange: function(component, property, oldValue, newValue) {
        this.capture({
            type: this.EVENT_TYPES.STATE_CHANGE,
            component,
            property,
            oldValue,
            newValue,
            timestamp: window.Utils ? window.Utils.now() : Date.now()
        });
    },
    
    /**
     * Log a widget event
     * @param {string} widgetId
     * @param {string} event
     * @param {object} data
     */
    logWidgetEvent: function(widgetId, event, data = {}) {
        this.capture({
            type: this.EVENT_TYPES.WIDGET_EVENT,
            widgetId,
            event,
            ...data,
            timestamp: window.Utils ? window.Utils.now() : Date.now()
        });
    },
    
    /**
     * Log a database operation
     * @param {string} operation
     * @param {string} store
     * @param {object} data
     */
    logDBOp: function(operation, store, data = {}) {
        this.capture({
            type: this.EVENT_TYPES.DB_OP,
            operation,
            store,
            ...data,
            timestamp: window.Utils ? window.Utils.now() : Date.now()
        });
    },
    
    /**
     * Simple log (backward compatibility)
     * @param {string} category
     * @param {string} message
     * @param {object} data
     */
    log: function(category, message, data = {}) {
        this.capture({
            type: 'log',
            category,
            message,
            ...data,
            timestamp: window.Utils ? window.Utils.now() : Date.now()
        });
    },
    
    /**
     * Get all captured events
     * @param {object} filter Optional filter
     * @returns {Array} Events
     */
    getEvents: function(filter = {}) {
        let events = [...this._buffer];
        
        if (filter.type) {
            events = events.filter(e => e.type === filter.type);
        }
        
        if (filter.since) {
            events = events.filter(e => e.timestamp >= filter.since);
        }
        
        if (filter.until) {
            events = events.filter(e => e.timestamp <= filter.until);
        }
        
        if (filter.action) {
            events = events.filter(e => e.action === filter.action);
        }
        
        return events;
    },
    
    /**
     * Get events by type
     * @param {string} type
     * @returns {Array} Events
     */
    getEventsByType: function(type) {
        return this.getEvents({ type });
    },
    
    /**
     * Get recent events
     * @param {number} count
     * @returns {Array} Events
     */
    getRecent: function(count = 10) {
        return this._buffer.slice(-count);
    },
    
    /**
     * Clear buffer
     */
    clear: function() {
        this._buffer = [];
    },
    
    /**
     * Add event listener
     * @param {function} callback
     */
    addListener: function(callback) {
        if (typeof callback === 'function') {
            this._listeners.push(callback);
        }
    },
    
    /**
     * Remove event listener
     * @param {function} callback
     */
    removeListener: function(callback) {
        const index = this._listeners.indexOf(callback);
        if (index > -1) {
            this._listeners.splice(index, 1);
        }
    },
    
    /**
     * Get statistics
     * @returns {object} Stats
     */
    getStats: function() {
        const stats = {
            total: this._buffer.length,
            byType: {},
            errors: 0,
            warnings: 0,
            ruleDenials: 0,
            ruleAllows: 0
        };
        
        this._buffer.forEach(event => {
            stats.byType[event.type] = (stats.byType[event.type] || 0) + 1;
            
            if (event.type === this.EVENT_TYPES.ERROR || event.type === this.EVENT_TYPES.CRASH) {
                stats.errors++;
            }
            if (event.type === this.EVENT_TYPES.WARNING) {
                stats.warnings++;
            }
            if (event.type === this.EVENT_TYPES.RULE_DENIAL) {
                stats.ruleDenials++;
            }
            if (event.type === this.EVENT_TYPES.RULE_ALLOW) {
                stats.ruleAllows++;
            }
        });
        
        return stats;
    },
    
    // ============================================
    // Private Methods
    // ============================================
    
    /**
     * Check if in development mode
     * @returns {boolean}
     */
    _isDevelopment: function() {
        return window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1' ||
               window.location.protocol === 'file:';
    },
    
    /**
     * Log to console (development only)
     * @param {object} event
     */
    _logToConsole: function(event) {
        const prefix = `[${event.type}]`;
        const message = event.message || event.action || 'Event';
        
        switch (event.type) {
            case this.EVENT_TYPES.ERROR:
            case this.EVENT_TYPES.CRASH:
                console.error(prefix, message, event);
                break;
            case this.EVENT_TYPES.WARNING:
                console.warn(prefix, message, event);
                break;
            case this.EVENT_TYPES.RULE_DENIAL:
                console.warn(prefix, `DENIED: ${event.action} on ${event.target}`, event.reason);
                break;
            default:
                console.log(prefix, message, event);
        }
    },
    
    /**
     * Generate simple ID (fallback)
     * @returns {string}
     */
    _generateId: function() {
        return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    }
};

// Auto-initialize on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.Debugger.init());
} else {
    window.Debugger.init();
}

