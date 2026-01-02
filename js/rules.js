// --- MODULE: RULES (Root Authority) ---
// ALL PERMISSIONS AND CONFLICTS RESOLVED HERE
// Other modules MUST delegate to this module for any action

window.Rules = {
    // Internal state
    _rules: [],
    _initialized: false,
    
    // Rule hierarchy (highest priority first)
    HIERARCHY: ['system', 'environment', 'project', 'mode', 'widget'],
    
    // Action taxonomy (all valid actions)
    ACTIONS: {
        // Widget actions
        'widget.open': true,
        'widget.close': true,
        'widget.execute': true,
        'widget.install': true,
        'widget.uninstall': true,
        
        // Window actions
        'window.create': true,
        'window.close': true,
        'window.move': true,
        'window.resize': true,
        'window.focus': true,
        'window.minimize': true,
        'window.maximize': true,
        
        // Database actions
        'db.read': true,
        'db.write': true,
        'db.delete': true,
        'db.export': true,
        'db.import': true,
        
        // Project actions
        'project.create': true,
        'project.open': true,
        'project.save': true,
        'project.export': true,
        'project.delete': true,
        'project.switch': true,
        'project.clone': true,
        
        // Page actions
        'page.create': true,
        'page.update': true,
        'page.delete': true,
        'page.preview': true,
        
        // UI actions
        'ui.notify': true,
        'ui.alert': true,
        'ui.confirm': true,
        
        // System actions
        'system.boot': true,
        'system.shutdown': true,
        'system.debug': true,
        'system.log': true,
        'system.settings.read': true,
        'system.settings.write': true
    },
    
    /**
     * Initialize rules engine
     */
    init: function() {
        if (this._initialized) return;
        
        this._rules = [];
        this._loadSystemRules();
        this._initialized = true;
        
        if (window.Debugger) {
            window.Debugger.log('rules', 'Rules engine initialized');
        }
    },
    
    /**
     * Load default system rules
     */
    _loadSystemRules: function() {
        // System rule: Always allow system.boot
        this.register({
            id: 'system-boot-allow',
            name: 'Allow System Boot',
            priority: 1000,
            level: 'system',
            condition: {
                action: 'system.boot',
                target: '*',
                when: 'always'
            },
            effect: {
                type: 'allow',
                reason: 'System boot is always allowed'
            },
            enabled: true
        });
        
        // System rule: Always allow system.log
        this.register({
            id: 'system-log-allow',
            name: 'Allow System Logging',
            priority: 1000,
            level: 'system',
            condition: {
                action: 'system.log',
                target: '*',
                when: 'always'
            },
            effect: {
                type: 'allow',
                reason: 'System logging is always allowed'
            },
            enabled: true
        });
        
        // System rule: Always allow debugger
        this.register({
            id: 'system-debug-allow',
            name: 'Allow Debugger',
            priority: 1000,
            level: 'system',
            condition: {
                action: 'system.debug',
                target: '*',
                when: 'always'
            },
            effect: {
                type: 'allow',
                reason: 'Debugger access is always allowed'
            },
            enabled: true
        });
        
        // System rule: Deny dangerous actions by default
        this.register({
            id: 'system-dangerous-deny',
            name: 'Deny Dangerous Actions',
            priority: 50,
            level: 'system',
            condition: {
                action: '*',
                target: '*',
                when: 'always'
            },
            effect: {
                type: 'deny',
                reason: 'Action not explicitly allowed'
            },
            enabled: false // Disabled by default - will be enabled if no other rules match
        });
    },
    
    /**
     * Register a rule
     * @param {object} rule Rule object
     * @returns {boolean} Success
     */
    register: function(rule) {
        if (!rule || !rule.id) {
            if (window.Debugger) {
                window.Debugger.logError('Rules.register: Invalid rule object', null, { rule });
            }
            return false;
        }
        
        // Validate rule structure
        if (!this._validateRule(rule)) {
            return false;
        }
        
        // Check if rule already exists
        const existingIndex = this._rules.findIndex(r => r.id === rule.id);
        if (existingIndex >= 0) {
            // Update existing rule
            this._rules[existingIndex] = rule;
        } else {
            // Add new rule
            this._rules.push(rule);
        }
        
        // Sort by priority (highest first)
        this._rules.sort((a, b) => b.priority - a.priority);
        
        if (window.Debugger) {
            window.Debugger.log('rules', `Rule registered: ${rule.id}`, { rule });
        }
        
        return true;
    },
    
    /**
     * Unregister a rule
     * @param {string} ruleId
     * @returns {boolean} Success
     */
    unregister: function(ruleId) {
        const index = this._rules.findIndex(r => r.id === ruleId);
        if (index >= 0) {
            const rule = this._rules[index];
            
            // Prevent removal of system rules
            if (rule.level === 'system') {
                if (window.Debugger) {
                    window.Debugger.logWarning('Cannot remove system rules', { ruleId });
                }
                return false;
            }
            
            this._rules.splice(index, 1);
            
            if (window.Debugger) {
                window.Debugger.log('rules', `Rule unregistered: ${ruleId}`);
            }
            return true;
        }
        return false;
    },
    
    /**
     * Evaluate an action
     * @param {object} request {action, target, context, source}
     * @returns {object} {allowed: boolean, reason?: string, modifiedAction?: object}
     */
    evaluate: function(request) {
        if (!this._initialized) {
            this.init();
        }
        
        if (!request || !request.action) {
            return {
                allowed: false,
                reason: 'Invalid request: missing action'
            };
        }
        
        // Validate action exists in taxonomy
        if (!this.ACTIONS[request.action] && request.action !== '*') {
            if (window.Debugger) {
                window.Debugger.logWarning(`Unknown action: ${request.action}`, { request });
            }
            return {
                allowed: false,
                reason: `Unknown action: ${request.action}`
            };
        }
        
        const { action, target = '*', context = {}, source = 'unknown' } = request;
        
        // Get applicable rules (sorted by priority)
        const applicableRules = this._getApplicableRules(action, target, context);
        
        // Evaluate rules in priority order
        for (const rule of applicableRules) {
            if (!rule.enabled) continue;
            
            // Check condition matches
            if (!this._matchesCondition(rule.condition, action, target, context)) {
                continue;
            }
            
            // Apply effect
            const result = this._applyEffect(rule.effect, request);
            
            // Log evaluation
            if (window.Debugger) {
                window.Debugger.logRule(action, target, result, {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    source,
                    ...context
                });
            }
            
            return result;
        }
        
        // No matching rule - default deny
        const defaultResult = {
            allowed: false,
            reason: 'No matching rule found'
        };
        
        if (window.Debugger) {
            window.Debugger.logRule(action, target, defaultResult, {
                source,
                ...context
            });
        }
        
        return defaultResult;
    },
    
    /**
     * Get applicable rules for an action
     * @param {string} action
     * @param {string} target
     * @param {object} context
     * @returns {Array} Applicable rules
     */
    _getApplicableRules: function(action, target, context) {
        return this._rules.filter(rule => {
            if (!rule.enabled) return false;
            
            const cond = rule.condition;
            
            // Check action match
            if (cond.action !== '*' && cond.action !== action) {
                return false;
            }
            
            // Check target match
            if (cond.target !== '*' && !this._matchesTarget(cond.target, target)) {
                return false;
            }
            
            // Check when condition
            if (cond.when && cond.when !== 'always') {
                if (!this._matchesWhen(cond.when, context)) {
                    return false;
                }
            }
            
            return true;
        });
    },
    
    /**
     * Check if condition matches
     * @param {object} condition
     * @param {string} action
     * @param {string} target
     * @param {object} context
     * @returns {boolean}
     */
    _matchesCondition: function(condition, action, target, context) {
        // Action match
        if (condition.action !== '*' && condition.action !== action) {
            return false;
        }
        
        // Target match
        if (condition.target !== '*' && !this._matchesTarget(condition.target, target)) {
            return false;
        }
        
        // When condition
        if (condition.when && condition.when !== 'always') {
            if (!this._matchesWhen(condition.when, context)) {
                return false;
            }
        }
        
        // Additional context checks
        if (condition.context) {
            for (const key in condition.context) {
                if (context[key] !== condition.context[key]) {
                    return false;
                }
            }
        }
        
        return true;
    },
    
    /**
     * Check if target matches pattern
     * @param {string} pattern
     * @param {string} target
     * @returns {boolean}
     */
    _matchesTarget: function(pattern, target) {
        if (pattern === '*') return true;
        if (pattern === target) return true;
        
        // Regex support
        if (pattern.startsWith('/') && pattern.endsWith('/')) {
            const regex = new RegExp(pattern.slice(1, -1));
            return regex.test(target);
        }
        
        // Wildcard support (e.g., "widget.*")
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            return regex.test(target);
        }
        
        return false;
    },
    
    /**
     * Check if when condition matches context
     * @param {string} when
     * @param {object} context
     * @returns {boolean}
     */
    _matchesWhen: function(when, context) {
        if (when === 'always') return true;
        
        // Mode conditions (e.g., "mode:edit")
        if (when.startsWith('mode:')) {
            const mode = when.substring(5);
            return context.mode === mode || context.activeMode === mode;
        }
        
        // Custom conditions can be added here
        return false;
    },
    
    /**
     * Apply rule effect
     * @param {object} effect
     * @param {object} request
     * @returns {object} Result
     */
    _applyEffect: function(effect, request) {
        switch (effect.type) {
            case 'allow':
                return {
                    allowed: true,
                    reason: effect.reason || 'Action allowed by rule'
                };
                
            case 'deny':
                return {
                    allowed: false,
                    reason: effect.reason || 'Action denied by rule'
                };
                
            case 'modify':
                if (effect.transform && typeof effect.transform === 'function') {
                    try {
                        const modifiedAction = effect.transform(request);
                        return {
                            allowed: true,
                            reason: effect.reason || 'Action modified by rule',
                            modifiedAction
                        };
                    } catch (e) {
                        if (window.Debugger) {
                            window.Debugger.logError('Rule transform error', e, { effect, request });
                        }
                        return {
                            allowed: false,
                            reason: 'Rule transform failed'
                        };
                    }
                }
                // Fallback: allow with modification data
                return {
                    allowed: true,
                    reason: effect.reason || 'Action modified by rule',
                    modifiedAction: effect.modifiedAction || request
                };
                
            default:
                return {
                    allowed: false,
                    reason: `Unknown effect type: ${effect.type}`
                };
        }
    },
    
    /**
     * Validate rule structure
     * @param {object} rule
     * @returns {boolean}
     */
    _validateRule: function(rule) {
        if (!rule.id || typeof rule.id !== 'string') {
            return false;
        }
        
        if (!rule.name || typeof rule.name !== 'string') {
            return false;
        }
        
        if (typeof rule.priority !== 'number' || rule.priority < 1 || rule.priority > 1000) {
            return false;
        }
        
        if (!this.HIERARCHY.includes(rule.level)) {
            return false;
        }
        
        if (!rule.condition || typeof rule.condition !== 'object') {
            return false;
        }
        
        if (!rule.condition.action || typeof rule.condition.action !== 'string') {
            return false;
        }
        
        if (!rule.effect || typeof rule.effect !== 'object') {
            return false;
        }
        
        const validEffects = ['allow', 'deny', 'modify'];
        if (!validEffects.includes(rule.effect.type)) {
            return false;
        }
        
        if (typeof rule.enabled !== 'boolean') {
            return false;
        }
        
        return true;
    },
    
    /**
     * Get all registered rules
     * @param {object} filter Optional filter
     * @returns {Array} Rules
     */
    getAll: function(filter = {}) {
        let rules = [...this._rules];
        
        if (filter.level) {
            rules = rules.filter(r => r.level === filter.level);
        }
        
        if (filter.enabled !== undefined) {
            rules = rules.filter(r => r.enabled === filter.enabled);
        }
        
        if (filter.action) {
            rules = rules.filter(r => 
                r.condition.action === filter.action || r.condition.action === '*'
            );
        }
        
        return rules;
    },
    
    /**
     * Get rule by ID
     * @param {string} ruleId
     * @returns {object|null} Rule or null
     */
    get: function(ruleId) {
        return this._rules.find(r => r.id === ruleId) || null;
    },
    
    /**
     * Clear all non-system rules
     */
    clear: function() {
        this._rules = this._rules.filter(r => r.level === 'system');
    },
    
    /**
     * Load rules from project
     * @param {object} project
     */
    loadProjectRules: function(project) {
        if (!project || !project.rules) return;
        
        // Remove existing project-level rules
        this._rules = this._rules.filter(r => r.level !== 'project');
        
        // Add project rules
        project.rules.forEach(rule => {
            if (rule.level === 'project') {
                this.register(rule);
            }
        });
        
        if (window.Debugger) {
            window.Debugger.log('rules', `Loaded ${project.rules.length} project rules`);
        }
    },
    
    /**
     * Check if action is allowed (convenience method)
     * @param {string} action
     * @param {string} target
     * @param {object} context
     * @returns {boolean}
     */
    isAllowed: function(action, target = '*', context = {}) {
        const result = this.evaluate({ action, target, context });
        return result.allowed;
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.Rules.init());
} else {
    window.Rules.init();
}

