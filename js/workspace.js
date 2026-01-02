// --- MODULE: WORKSPACE (Multi-Project Workspace) ---
// Manages multiple projects, switching between them, independent export pipelines

window.Workspace = {
    // Internal state
    _activeProject: null,
    _activeMode: 'edit',
    _dirty: false,
    _projects: new Map(),
    _initialized: false,
    
    /**
     * Initialize workspace
     */
    init: async function() {
        if (this._initialized) return;
        
        // Ensure DB is initialized
        if (window.DB) {
            await window.DB.init();
        }
        
        // Load projects
        await this._loadProjects();
        
        // Restore active project from settings
        const lastProjectId = await window.Settings.get('workspace.lastProject', null);
        if (lastProjectId) {
            try {
                await this.switchProject(lastProjectId);
            } catch (e) {
                if (window.Debugger) {
                    window.Debugger.logError('Failed to restore last project', e);
                }
            }
        }
        
        this._initialized = true;
        
        if (window.Debugger) {
            window.Debugger.log('workspace', 'Workspace initialized');
        }
    },
    
    /**
     * Load all projects from DB
     */
    _loadProjects: async function() {
        if (!window.DB) return;
        
        try {
            const projects = await window.DB.getAllProjects();
            this._projects.clear();
            
            for (const project of projects) {
                // Validate project
                if (window.Project && window.Project.isValid(project)) {
                    this._projects.set(project.id, project);
                } else {
                    if (window.Debugger) {
                        window.Debugger.logWarning(`Invalid project skipped: ${project.id}`);
                    }
                }
            }
            
            if (window.Debugger) {
                window.Debugger.log('workspace', `Loaded ${projects.length} projects`);
            }
        } catch (e) {
            if (window.Debugger) {
                window.Debugger.logError('Failed to load projects', e);
            }
        }
    },
    
    /**
     * Create a new project
     * @param {object} options Project options
     * @returns {Promise<object>} Created project
     */
    createProject: async function(options = {}) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'project.create',
                target: '*',
                context: { options }
            });
            
            if (!result.allowed) {
                throw new Error(`Project creation denied: ${result.reason}`);
            }
        }
        
        // Create project
        const project = window.Project ? window.Project.create(options) : this._createProjectFallback(options);
        
        // Validate
        if (window.Project) {
            const validation = window.Project.validate(project);
            if (!validation.valid) {
                throw new Error(`Invalid project: ${validation.errors.join(', ')}`);
            }
        }
        
        // Save to DB
        if (window.DB) {
            await window.DB.saveProject(project);
        }
        
        // Add to cache
        this._projects.set(project.id, project);
        
        // Load project rules
        if (window.Rules && project.rules) {
            window.Rules.loadProjectRules(project);
        }
        
        if (window.Debugger) {
            window.Debugger.logAction('project.create', { projectId: project.id, name: project.meta.name });
        }
        
        return project;
    },
    
    /**
     * Switch to a project
     * @param {string} projectId
     * @returns {Promise<object>} Project
     */
    switchProject: async function(projectId) {
        // Check for unsaved changes
        if (this._dirty && this._activeProject) {
            // In a real implementation, you'd prompt the user
            if (window.Debugger) {
                window.Debugger.logWarning('Switching project with unsaved changes', { projectId });
            }
        }
        
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'project.switch',
                target: projectId,
                context: { currentProject: this._activeProject ? this._activeProject.id : null }
            });
            
            if (!result.allowed) {
                throw new Error(`Project switch denied: ${result.reason}`);
            }
        }
        
        // Get project
        let project = this._projects.get(projectId);
        
        if (!project && window.DB) {
            project = await window.DB.getProject(projectId);
            if (project) {
                this._projects.set(projectId, project);
            }
        }
        
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }
        
        // Validate project
        if (window.Project && !window.Project.isValid(project)) {
            const validation = window.Project.validate(project);
            throw new Error(`Invalid project: ${validation.errors.join(', ')}`);
        }
        
        // Set active project
        this._activeProject = project;
        this._activeMode = project.modes.active || 'edit';
        this._dirty = false;
        
        // Load project rules
        if (window.Rules && project.rules) {
            window.Rules.loadProjectRules(project);
        }
        
        // Save last project to settings
        if (window.Settings) {
            await window.Settings.set('workspace.lastProject', projectId);
        }
        
        // Emit change event
        this._emitChange('project.switch', { projectId, project });
        
        if (window.Debugger) {
            window.Debugger.logAction('project.switch', { projectId, name: project.meta.name });
        }
        
        return project;
    },
    
    /**
     * Save current project
     * @returns {Promise<object>} Saved project
     */
    saveProject: async function() {
        if (!this._activeProject) {
            throw new Error('No active project');
        }
        
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'project.save',
                target: this._activeProject.id,
                context: { project: this._activeProject }
            });
            
            if (!result.allowed) {
                throw new Error(`Project save denied: ${result.reason}`);
            }
        }
        
        // Update modified timestamp
        if (window.Project) {
            this._activeProject = window.Project.updateMeta(this._activeProject, {});
        } else {
            this._activeProject.meta.modified = window.Utils ? window.Utils.now() : Date.now();
        }
        
        // Save to DB
        if (window.DB) {
            await window.DB.saveProject(this._activeProject);
        }
        
        // Update cache
        this._projects.set(this._activeProject.id, this._activeProject);
        
        this._dirty = false;
        
        // Emit change event
        this._emitChange('project.save', { projectId: this._activeProject.id });
        
        if (window.Debugger) {
            window.Debugger.logAction('project.save', { projectId: this._activeProject.id });
        }
        
        return this._activeProject;
    },
    
    /**
     * Delete a project
     * @param {string} projectId
     * @returns {Promise<boolean>} Success
     */
    deleteProject: async function(projectId) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'project.delete',
                target: projectId,
                context: {}
            });
            
            if (!result.allowed) {
                throw new Error(`Project delete denied: ${result.reason}`);
            }
        }
        
        // Prevent deleting active project
        if (this._activeProject && this._activeProject.id === projectId) {
            throw new Error('Cannot delete active project');
        }
        
        // Delete from DB
        if (window.DB) {
            await window.DB.deleteProject(projectId);
        }
        
        // Remove from cache
        this._projects.delete(projectId);
        
        // Clear last project setting if it was this project
        if (window.Settings) {
            const lastProject = await window.Settings.get('workspace.lastProject');
            if (lastProject === projectId) {
                await window.Settings.set('workspace.lastProject', null);
            }
        }
        
        if (window.Debugger) {
            window.Debugger.logAction('project.delete', { projectId });
        }
        
        return true;
    },
    
    /**
     * Get active project
     * @returns {object|null} Active project
     */
    getActiveProject: function() {
        return this._activeProject;
    },
    
    /**
     * Get all projects
     * @returns {Array} Projects
     */
    getAllProjects: function() {
        return Array.from(this._projects.values());
    },
    
    /**
     * Get project by ID
     * @param {string} projectId
     * @returns {object|null} Project
     */
    getProject: function(projectId) {
        return this._projects.get(projectId) || null;
    },
    
    /**
     * Set active mode
     * @param {string} mode
     * @returns {boolean} Success
     */
    setMode: function(mode) {
        const validModes = ['edit', 'preview', 'export'];
        if (!validModes.includes(mode)) {
            return false;
        }
        
        if (!this._activeProject) {
            return false;
        }
        
        // Check if mode is available
        if (!this._activeProject.modes.available.includes(mode)) {
            return false;
        }
        
        this._activeMode = mode;
        this._activeProject.modes.active = mode;
        
        // Emit change event
        this._emitChange('mode.change', { mode });
        
        if (window.Debugger) {
            window.Debugger.logStateChange('workspace', 'activeMode', this._activeMode, mode);
        }
        
        return true;
    },
    
    /**
     * Get active mode
     * @returns {string} Active mode
     */
    getMode: function() {
        return this._activeMode;
    },
    
    /**
     * Mark workspace as dirty (has unsaved changes)
     * @param {boolean} dirty
     */
    setDirty: function(dirty = true) {
        this._dirty = dirty;
        
        if (window.Debugger) {
            window.Debugger.logStateChange('workspace', 'dirty', !dirty, dirty);
        }
    },
    
    /**
     * Check if workspace is dirty
     * @returns {boolean}
     */
    isDirty: function() {
        return this._dirty;
    },
    
    /**
     * Clone a project
     * @param {string} projectId
     * @param {object} options Clone options
     * @returns {Promise<object>} Cloned project
     */
    cloneProject: async function(projectId, options = {}) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'project.clone',
                target: projectId,
                context: { options }
            });
            
            if (!result.allowed) {
                throw new Error(`Project clone denied: ${result.reason}`);
            }
        }
        
        const sourceProject = this.getProject(projectId);
        if (!sourceProject) {
            throw new Error(`Project not found: ${projectId}`);
        }
        
        // Clone project
        const cloned = window.Project ? window.Project.clone(sourceProject) : JSON.parse(JSON.stringify(sourceProject));
        
        // Update metadata
        cloned.id = window.Utils ? window.Utils.uuid() : this._generateId();
        cloned.meta.name = options.name || `${cloned.meta.name} (Copy)`;
        cloned.meta.created = window.Utils ? window.Utils.now() : Date.now();
        cloned.meta.modified = cloned.meta.created;
        
        // Save cloned project
        if (window.DB) {
            await window.DB.saveProject(cloned);
        }
        
        // Add to cache
        this._projects.set(cloned.id, cloned);
        
        if (window.Debugger) {
            window.Debugger.logAction('project.clone', { sourceId: projectId, clonedId: cloned.id });
        }
        
        return cloned;
    },
    
    // ============================================
    // Private Methods
    // ============================================
    
    /**
     * Create project fallback (if Project module not available)
     * @param {object} options
     * @returns {object} Project
     */
    _createProjectFallback: function(options) {
        const now = window.Utils ? window.Utils.now() : Date.now();
        const id = window.Utils ? window.Utils.uuid() : this._generateId();
        
        return {
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
    },
    
    /**
     * Emit workspace change event
     * @param {string} event
     * @param {object} data
     */
    _emitChange: function(event, data) {
        if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent(`workspace:${event}`, {
                detail: data
            }));
        }
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
    document.addEventListener('DOMContentLoaded', () => window.Workspace.init());
} else {
    window.Workspace.init();
}

