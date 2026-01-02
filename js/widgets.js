// --- MODULE: WIDGETS (Widget SDK) ---
// Widgets declare intent, Rules decide if they are allowed to act
// Widgets cannot directly mutate DB or open windows without approval

window.Widgets = {
    // Internal registry
    _registry: new Map(),
    _instances: new Map(),
    _initialized: false,
    
    /**
     * Initialize widget system
     */
    init: async function() {
        if (this._initialized) return;
        
        this._registry.clear();
        this._instances.clear();
        
        // Load built-in widgets
        await this._loadBuiltIns();
        
        this._initialized = true;
        
        if (window.Debugger) {
            window.Debugger.log('widgets', 'Widget system initialized');
        }
    },
    
    /**
     * Load built-in widgets
     */
    _loadBuiltIns: async function() {
        // Built-in widgets will be registered here
        // For now, we'll have a placeholder system
    },
    
    /**
     * Register a widget
     * @param {object} widget Widget definition
     * @returns {boolean} Success
     */
    register: function(widget) {
        if (!widget || !widget.id) {
            if (window.Debugger) {
                window.Debugger.logError('Widget registration failed: Invalid widget', null, { widget });
            }
            return false;
        }
        
        // Validate widget structure
        if (!this._validateWidget(widget)) {
            return false;
        }
        
        // Check if widget already exists
        if (this._registry.has(widget.id)) {
            if (window.Debugger) {
                window.Debugger.logWarning(`Widget already registered: ${widget.id}`);
            }
            return false;
        }
        
        // Store widget definition
        this._registry.set(widget.id, {
            ...widget,
            registered: window.Utils ? window.Utils.now() : Date.now()
        });
        
        if (window.Debugger) {
            window.Debugger.log('widgets', `Widget registered: ${widget.id}`, { widget });
        }
        
        return true;
    },
    
    /**
     * Unregister a widget
     * @param {string} widgetId
     * @returns {boolean} Success
     */
    unregister: function(widgetId) {
        if (!this._registry.has(widgetId)) {
            return false;
        }
        
        // Close all instances
        const instances = Array.from(this._instances.values()).filter(i => i.widgetId === widgetId);
        instances.forEach(instance => this.close(instance.id));
        
        this._registry.delete(widgetId);
        
        if (window.Debugger) {
            window.Debugger.log('widgets', `Widget unregistered: ${widgetId}`);
        }
        
        return true;
    },
    
    /**
     * Get widget definition
     * @param {string} widgetId
     * @returns {object|null} Widget definition
     */
    get: function(widgetId) {
        return this._registry.get(widgetId) || null;
    },
    
    /**
     * Get all registered widgets
     * @param {object} filter Optional filter
     * @returns {Array} Widget definitions
     */
    getAll: function(filter = {}) {
        const widgets = Array.from(this._registry.values());
        
        if (filter.type) {
            return widgets.filter(w => w.type === filter.type);
        }
        
        if (filter.enabled !== undefined) {
            return widgets.filter(w => w.enabled !== false);
        }
        
        return widgets;
    },
    
    /**
     * Open a widget instance
     * @param {string} widgetId
     * @param {object} options Options for widget instance
     * @returns {Promise<string>} Instance ID
     */
    open: async function(widgetId, options = {}) {
        // Check rules first
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'widget.open',
                target: widgetId,
                context: { options }
            });
            
            if (!result.allowed) {
                throw new Error(`Widget open denied: ${result.reason}`);
            }
        }
        
        const widget = this.get(widgetId);
        if (!widget) {
            throw new Error(`Widget not found: ${widgetId}`);
        }
        
        // Create instance
        const instanceId = window.Utils ? window.Utils.uuid() : this._generateId();
        const instance = {
            id: instanceId,
            widgetId,
            options,
            state: {},
            created: window.Utils ? window.Utils.now() : Date.now()
        };
        
        this._instances.set(instanceId, instance);
        
        // Call widget's open handler if it exists
        if (widget.onOpen && typeof widget.onOpen === 'function') {
            try {
                await widget.onOpen(instance, options);
            } catch (e) {
                if (window.Debugger) {
                    window.Debugger.logError(`Widget open handler failed: ${widgetId}`, e);
                }
                this._instances.delete(instanceId);
                throw e;
            }
        }
        
        if (window.Debugger) {
            window.Debugger.logWidgetEvent(widgetId, 'opened', { instanceId, options });
        }
        
        return instanceId;
    },
    
    /**
     * Close a widget instance
     * @param {string} instanceId
     * @returns {Promise<boolean>} Success
     */
    close: async function(instanceId) {
        const instance = this._instances.get(instanceId);
        if (!instance) {
            return false;
        }
        
        const widget = this.get(instance.widgetId);
        
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'widget.close',
                target: instance.widgetId,
                context: { instanceId }
            });
            
            if (!result.allowed) {
                throw new Error(`Widget close denied: ${result.reason}`);
            }
        }
        
        // Call widget's close handler if it exists
        if (widget && widget.onClose && typeof widget.onClose === 'function') {
            try {
                await widget.onClose(instance);
            } catch (e) {
                if (window.Debugger) {
                    window.Debugger.logError(`Widget close handler failed: ${instance.widgetId}`, e);
                }
            }
        }
        
        this._instances.delete(instanceId);
        
        if (window.Debugger) {
            window.Debugger.logWidgetEvent(instance.widgetId, 'closed', { instanceId });
        }
        
        return true;
    },
    
    /**
     * Execute widget action
     * @param {string} instanceId
     * @param {string} action
     * @param {*} data
     * @returns {Promise<*>} Result
     */
    execute: async function(instanceId, action, data = {}) {
        const instance = this._instances.get(instanceId);
        if (!instance) {
            throw new Error(`Widget instance not found: ${instanceId}`);
        }
        
        const widget = this.get(instance.widgetId);
        if (!widget) {
            throw new Error(`Widget not found: ${instance.widgetId}`);
        }
        
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'widget.execute',
                target: instance.widgetId,
                context: { instanceId, action, data }
            });
            
            if (!result.allowed) {
                throw new Error(`Widget execute denied: ${result.reason}`);
            }
        }
        
        // Check if action exists
        if (!widget.actions || !widget.actions[action]) {
            throw new Error(`Widget action not found: ${action}`);
        }
        
        const actionHandler = widget.actions[action];
        if (typeof actionHandler !== 'function') {
            throw new Error(`Widget action is not a function: ${action}`);
        }
        
        // Execute action
        try {
            const result = await actionHandler(instance, data);
            
            if (window.Debugger) {
                window.Debugger.logWidgetEvent(instance.widgetId, 'execute', { instanceId, action, data });
            }
            
            return result;
        } catch (e) {
            if (window.Debugger) {
                window.Debugger.logError(`Widget execute failed: ${instance.widgetId}.${action}`, e);
            }
            throw e;
        }
    },
    
    /**
     * Get widget instance
     * @param {string} instanceId
     * @returns {object|null} Instance
     */
    getInstance: function(instanceId) {
        return this._instances.get(instanceId) || null;
    },
    
    /**
     * Get all instances
     * @param {string} widgetId Optional widget ID filter
     * @returns {Array} Instances
     */
    getInstances: function(widgetId = null) {
        const instances = Array.from(this._instances.values());
        if (widgetId) {
            return instances.filter(i => i.widgetId === widgetId);
        }
        return instances;
    },
    
    /**
     * Update widget instance state
     * @param {string} instanceId
     * @param {object} stateUpdate
     * @returns {boolean} Success
     */
    updateState: function(instanceId, stateUpdate) {
        const instance = this._instances.get(instanceId);
        if (!instance) {
            return false;
        }
        
        instance.state = {
            ...instance.state,
            ...stateUpdate
        };
        
        if (window.Debugger) {
            window.Debugger.logStateChange('widget', instanceId, instance.state, stateUpdate);
        }
        
        return true;
    },
    
    /**
     * Request action through rules engine
     * @param {string} action
     * @param {string} target
     * @param {object} context
     * @returns {Promise<object>} Result
     */
    request: async function(action, target, context = {}) {
        if (!window.Rules) {
            throw new Error('Rules engine not available');
        }
        
        const result = window.Rules.evaluate({
            action,
            target,
            context,
            source: 'widget'
        });
        
        if (!result.allowed) {
            throw new Error(`Action denied: ${result.reason}`);
        }
        
        return result;
    },
    
    /**
     * Install widget to project
     * @param {string} widgetId
     * @param {string} projectId
     * @returns {Promise<boolean>} Success
     */
    install: async function(widgetId, projectId) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'widget.install',
                target: widgetId,
                context: { projectId }
            });
            
            if (!result.allowed) {
                throw new Error(`Widget install denied: ${result.reason}`);
            }
        }
        
        const widget = this.get(widgetId);
        if (!widget) {
            throw new Error(`Widget not found: ${widgetId}`);
        }
        
        // Get project
        if (!window.DB) {
            throw new Error('Database not available');
        }
        
        const project = await window.DB.getProject(projectId);
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }
        
        // Add widget to project's installed list
        if (!project.widgets.installed.includes(widgetId)) {
            project.widgets.installed.push(widgetId);
            await window.DB.saveProject(project);
        }
        
        if (window.Debugger) {
            window.Debugger.logWidgetEvent(widgetId, 'installed', { projectId });
        }
        
        return true;
    },
    
    /**
     * Uninstall widget from project
     * @param {string} widgetId
     * @param {string} projectId
     * @returns {Promise<boolean>} Success
     */
    uninstall: async function(widgetId, projectId) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'widget.uninstall',
                target: widgetId,
                context: { projectId }
            });
            
            if (!result.allowed) {
                throw new Error(`Widget uninstall denied: ${result.reason}`);
            }
        }
        
        // Get project
        if (!window.DB) {
            throw new Error('Database not available');
        }
        
        const project = await window.DB.getProject(projectId);
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }
        
        // Remove widget from project
        project.widgets.installed = project.widgets.installed.filter(id => id !== widgetId);
        project.widgets.active = project.widgets.active.filter(id => id !== widgetId);
        
        await window.DB.saveProject(project);
        
        // Close all instances of this widget in this project
        const instances = this.getInstances(widgetId);
        for (const instance of instances) {
            if (instance.options && instance.options.projectId === projectId) {
                await this.close(instance.id);
            }
        }
        
        if (window.Debugger) {
            window.Debugger.logWidgetEvent(widgetId, 'uninstalled', { projectId });
        }
        
        return true;
    },
    
    // ============================================
    // Private Methods
    // ============================================
    
    /**
     * Validate widget structure
     * @param {object} widget
     * @returns {boolean}
     */
    _validateWidget: function(widget) {
        if (!widget.id || typeof widget.id !== 'string') {
            return false;
        }
        
        if (!widget.name || typeof widget.name !== 'string') {
            return false;
        }
        
        if (!widget.version || typeof widget.version !== 'string') {
            return false;
        }
        
        if (widget.permissions && !Array.isArray(widget.permissions)) {
            return false;
        }
        
        if (widget.actions && typeof widget.actions !== 'object') {
            return false;
        }
        
        return true;
    },
    
    /**
     * Generate ID (fallback)
     * @returns {string}
     */
    _generateId: function() {
        return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.Widgets.init());
} else {
    window.Widgets.init();
}

