// --- MODULE: PROJECT (Model & Validator) ---
// Defines the Project schema and validation logic

window.Project = {
    // ============================================
    // Schema Definition
    // ============================================
    
    /**
     * Create a new empty project
     * @param {object} options
     * @returns {object} Project object
     */
    create: function(options = {}) {
        const now = window.Utils ? window.Utils.now() : Date.now();
        const id = window.Utils ? window.Utils.uuid() : this._generateId();
        
        const project = {
            id: options.id || id,
            meta: {
                name: options.name || 'Untitled Project',
                version: options.version || '1.0.0',
                created: options.created || now,
                modified: options.modified || now,
                author: options.author || '',
                description: options.description || ''
            },
            environment: {
                target: options.target || 'web',
                cdnAllowed: options.cdnAllowed !== false,
                cspEnabled: options.cspEnabled !== false
            },
            rules: options.rules || [],
            modes: {
                active: options.activeMode || 'edit',
                available: options.availableModes || ['edit', 'preview', 'export']
            },
            layout: {
                panels: options.panels || [],
                windows: options.windows || [],
                dock: options.dock || []
            },
            widgets: {
                installed: options.installedWidgets || [],
                active: options.activeWidgets || []
            },
            assets: {
                files: options.files || {},
                external: options.external || []
            },
            pages: options.pages || [],
            exports: {
                lastExport: null,
                settings: options.exportSettings || {}
            },
            history: options.history || []
        };
        
        return project;
    },
    
    /**
     * Validate a project object
     * @param {object} project
     * @returns {object} {valid: boolean, errors: Array}
     */
    validate: function(project) {
        const errors = [];
        
        if (!project) {
            return { valid: false, errors: ['Project is null or undefined'] };
        }
        
        // Validate ID
        if (!project.id || typeof project.id !== 'string') {
            errors.push('Project must have a valid string ID');
        }
        
        // Validate meta
        if (!project.meta) {
            errors.push('Project must have meta object');
        } else {
            if (!project.meta.name || typeof project.meta.name !== 'string') {
                errors.push('Project meta must have a valid name');
            }
            if (!project.meta.version || typeof project.meta.version !== 'string') {
                errors.push('Project meta must have a valid version');
            }
            if (typeof project.meta.created !== 'number' || project.meta.created <= 0) {
                errors.push('Project meta must have a valid created timestamp');
            }
            if (typeof project.meta.modified !== 'number' || project.meta.modified <= 0) {
                errors.push('Project meta must have a valid modified timestamp');
            }
        }
        
        // Validate environment
        if (!project.environment) {
            errors.push('Project must have environment object');
        } else {
            const validTargets = ['web', 'electron'];
            if (!validTargets.includes(project.environment.target)) {
                errors.push(`Project environment.target must be one of: ${validTargets.join(', ')}`);
            }
            if (typeof project.environment.cdnAllowed !== 'boolean') {
                errors.push('Project environment.cdnAllowed must be a boolean');
            }
            if (typeof project.environment.cspEnabled !== 'boolean') {
                errors.push('Project environment.cspEnabled must be a boolean');
            }
        }
        
        // Validate rules
        if (!Array.isArray(project.rules)) {
            errors.push('Project rules must be an array');
        } else {
            project.rules.forEach((rule, index) => {
                const ruleErrors = this._validateRule(rule, index);
                errors.push(...ruleErrors);
            });
        }
        
        // Validate modes
        if (!project.modes) {
            errors.push('Project must have modes object');
        } else {
            const validModes = ['edit', 'preview', 'export'];
            if (!validModes.includes(project.modes.active)) {
                errors.push(`Project modes.active must be one of: ${validModes.join(', ')}`);
            }
            if (!Array.isArray(project.modes.available)) {
                errors.push('Project modes.available must be an array');
            } else {
                project.modes.available.forEach(mode => {
                    if (!validModes.includes(mode)) {
                        errors.push(`Invalid mode in modes.available: ${mode}`);
                    }
                });
            }
        }
        
        // Validate layout
        if (!project.layout) {
            errors.push('Project must have layout object');
        } else {
            if (!Array.isArray(project.layout.panels)) {
                errors.push('Project layout.panels must be an array');
            }
            if (!Array.isArray(project.layout.windows)) {
                errors.push('Project layout.windows must be an array');
            }
            if (!Array.isArray(project.layout.dock)) {
                errors.push('Project layout.dock must be an array');
            }
        }
        
        // Validate widgets
        if (!project.widgets) {
            errors.push('Project must have widgets object');
        } else {
            if (!Array.isArray(project.widgets.installed)) {
                errors.push('Project widgets.installed must be an array');
            }
            if (!Array.isArray(project.widgets.active)) {
                errors.push('Project widgets.active must be an array');
            }
        }
        
        // Validate assets
        if (!project.assets) {
            errors.push('Project must have assets object');
        } else {
            if (typeof project.assets.files !== 'object' || Array.isArray(project.assets.files)) {
                errors.push('Project assets.files must be an object');
            }
            if (!Array.isArray(project.assets.external)) {
                errors.push('Project assets.external must be an array');
            }
        }
        
        // Validate pages
        if (!Array.isArray(project.pages)) {
            errors.push('Project pages must be an array');
        } else {
            project.pages.forEach((page, index) => {
                const pageErrors = this._validatePage(page, index);
                errors.push(...pageErrors);
            });
        }
        
        // Validate exports
        if (!project.exports) {
            errors.push('Project must have exports object');
        } else {
            if (project.exports.lastExport !== null && typeof project.exports.lastExport !== 'number') {
                errors.push('Project exports.lastExport must be null or a number');
            }
            if (typeof project.exports.settings !== 'object' || Array.isArray(project.exports.settings)) {
                errors.push('Project exports.settings must be an object');
            }
        }
        
        // Validate history
        if (!Array.isArray(project.history)) {
            errors.push('Project history must be an array');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    },
    
    /**
     * Validate a rule object
     * @param {object} rule
     * @param {number} index
     * @returns {Array} Errors
     */
    _validateRule: function(rule, index) {
        const errors = [];
        const prefix = `Rule[${index}]`;
        
        if (!rule || typeof rule !== 'object') {
            return [`${prefix}: Rule must be an object`];
        }
        
        if (!rule.id || typeof rule.id !== 'string') {
            errors.push(`${prefix}: Rule must have a valid string ID`);
        }
        
        if (!rule.name || typeof rule.name !== 'string') {
            errors.push(`${prefix}: Rule must have a valid name`);
        }
        
        if (typeof rule.priority !== 'number' || rule.priority < 1 || rule.priority > 1000) {
            errors.push(`${prefix}: Rule priority must be a number between 1 and 1000`);
        }
        
        const validLevels = ['system', 'environment', 'project', 'mode', 'widget'];
        if (!validLevels.includes(rule.level)) {
            errors.push(`${prefix}: Rule level must be one of: ${validLevels.join(', ')}`);
        }
        
        if (!rule.condition || typeof rule.condition !== 'object') {
            errors.push(`${prefix}: Rule must have a condition object`);
        } else {
            if (!rule.condition.action || typeof rule.condition.action !== 'string') {
                errors.push(`${prefix}: Rule condition must have an action string`);
            }
        }
        
        if (!rule.effect || typeof rule.effect !== 'object') {
            errors.push(`${prefix}: Rule must have an effect object`);
        } else {
            const validEffects = ['allow', 'deny', 'modify'];
            if (!validEffects.includes(rule.effect.type)) {
                errors.push(`${prefix}: Rule effect.type must be one of: ${validEffects.join(', ')}`);
            }
        }
        
        if (typeof rule.enabled !== 'boolean') {
            errors.push(`${prefix}: Rule enabled must be a boolean`);
        }
        
        return errors;
    },
    
    /**
     * Validate a page object
     * @param {object} page
     * @param {number} index
     * @returns {Array} Errors
     */
    _validatePage: function(page, index) {
        const errors = [];
        const prefix = `Page[${index}]`;
        
        if (!page || typeof page !== 'object') {
            return [`${prefix}: Page must be an object`];
        }
        
        if (!page.id || typeof page.id !== 'string') {
            errors.push(`${prefix}: Page must have a valid string ID`);
        }
        
        if (!page.name || typeof page.name !== 'string') {
            errors.push(`${prefix}: Page must have a valid name`);
        }
        
        if (!page.path || typeof page.path !== 'string') {
            errors.push(`${prefix}: Page must have a valid path`);
        }
        
        return errors;
    },
    
    /**
     * Freeze a project (make it immutable)
     * @param {object} project
     * @returns {object} Frozen project
     */
    freeze: function(project) {
        if (!project) return project;
        
        if (window.Utils && window.Utils.deepFreeze) {
            return window.Utils.deepFreeze(project);
        }
        
        // Fallback freeze
        Object.freeze(project);
        Object.keys(project).forEach(key => {
            if (project[key] && typeof project[key] === 'object') {
                Object.freeze(project[key]);
            }
        });
        
        return project;
    },
    
    /**
     * Clone a project (deep copy)
     * @param {object} project
     * @returns {object} Cloned project
     */
    clone: function(project) {
        if (!project) return project;
        
        if (window.Utils && window.Utils.deepClone) {
            return window.Utils.deepClone(project);
        }
        
        return JSON.parse(JSON.stringify(project));
    },
    
    /**
     * Update project metadata
     * @param {object} project
     * @param {object} updates
     * @returns {object} Updated project
     */
    updateMeta: function(project, updates) {
        const cloned = this.clone(project);
        cloned.meta = {
            ...cloned.meta,
            ...updates,
            modified: window.Utils ? window.Utils.now() : Date.now()
        };
        return cloned;
    },
    
    /**
     * Add a page to project
     * @param {object} project
     * @param {object} page
     * @returns {object} Updated project
     */
    addPage: function(project, page) {
        const cloned = this.clone(project);
        
        if (!page.id) {
            page.id = window.Utils ? window.Utils.uuid() : this._generateId();
        }
        
        cloned.pages.push(page);
        cloned.meta.modified = window.Utils ? window.Utils.now() : Date.now();
        
        return cloned;
    },
    
    /**
     * Remove a page from project
     * @param {object} project
     * @param {string} pageId
     * @returns {object} Updated project
     */
    removePage: function(project, pageId) {
        const cloned = this.clone(project);
        cloned.pages = cloned.pages.filter(p => p.id !== pageId);
        cloned.meta.modified = window.Utils ? window.Utils.now() : Date.now();
        return cloned;
    },
    
    /**
     * Get page by ID
     * @param {object} project
     * @param {string} pageId
     * @returns {object|null} Page or null
     */
    getPage: function(project, pageId) {
        return project.pages.find(p => p.id === pageId) || null;
    },
    
    /**
     * Get page by path
     * @param {object} project
     * @param {string} path
     * @returns {object|null} Page or null
     */
    getPageByPath: function(project, path) {
        const normalized = window.Utils ? window.Utils.normalizePath(path) : path;
        return project.pages.find(p => {
            const pagePath = window.Utils ? window.Utils.normalizePath(p.path) : p.path;
            return pagePath === normalized;
        }) || null;
    },
    
    /**
     * Add a rule to project
     * @param {object} project
     * @param {object} rule
     * @returns {object} Updated project
     */
    addRule: function(project, rule) {
        const cloned = this.clone(project);
        
        if (!rule.id) {
            rule.id = window.Utils ? window.Utils.uuid() : this._generateId();
        }
        
        cloned.rules.push(rule);
        cloned.meta.modified = window.Utils ? window.Utils.now() : Date.now();
        
        return cloned;
    },
    
    /**
     * Remove a rule from project
     * @param {object} project
     * @param {string} ruleId
     * @returns {object} Updated project
     */
    removeRule: function(project, ruleId) {
        const cloned = this.clone(project);
        cloned.rules = cloned.rules.filter(r => r.id !== ruleId);
        cloned.meta.modified = window.Utils ? window.Utils.now() : Date.now();
        return cloned;
    },
    
    /**
     * Get rule by ID
     * @param {object} project
     * @param {string} ruleId
     * @returns {object|null} Rule or null
     */
    getRule: function(project, ruleId) {
        return project.rules.find(r => r.id === ruleId) || null;
    },
    
    /**
     * Check if project is valid
     * @param {object} project
     * @returns {boolean}
     */
    isValid: function(project) {
        const validation = this.validate(project);
        return validation.valid;
    },
    
    /**
     * Generate ID (fallback)
     * @returns {string}
     */
    _generateId: function() {
        return 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    }
};

