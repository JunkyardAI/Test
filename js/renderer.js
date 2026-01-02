// --- MODULE: RENDERER (Declarative UI) ---
// Visual rendering layer - consumes layout + workspace state
// NO BUSINESS LOGIC - NO DATA MUTATION
// Pure rendering functions only

window.Renderer = {
    // Internal state
    _initialized: false,
    _currentLayout: null,
    _renderedElements: new Map(),
    
    /**
     * Initialize renderer
     */
    init: function() {
        if (this._initialized) return;
        
        this._renderedElements.clear();
        this._currentLayout = null;
        
        // Listen for workspace changes
        if (window.addEventListener) {
            window.addEventListener('workspace:project.switch', (e) => {
                this.render();
            });
            
            window.addEventListener('workspace:mode.change', (e) => {
                this.render();
            });
        }
        
        this._initialized = true;
        
        if (window.Debugger) {
            window.Debugger.log('renderer', 'Renderer initialized');
        }
    },
    
    /**
     * Render workspace state
     * @param {object} layout Optional layout override
     */
    render: function(layout = null) {
        if (!this._initialized) {
            this.init();
        }
        
        // Get workspace state
        const workspace = window.Workspace;
        if (!workspace) {
            if (window.Debugger) {
                window.Debugger.logWarning('Renderer: Workspace not available');
            }
            return;
        }
        
        const project = workspace.getActiveProject();
        if (!project) {
            // Render empty state
            this._renderEmpty();
            return;
        }
        
        // Use provided layout or project layout
        const activeLayout = layout || project.layout || {};
        this._currentLayout = activeLayout;
        
        // Render panels
        if (activeLayout.panels) {
            this._renderPanels(activeLayout.panels);
        }
        
        // Render windows
        if (activeLayout.windows) {
            this._renderWindows(activeLayout.windows);
        }
        
        // Render dock
        if (activeLayout.dock) {
            this._renderDock(activeLayout.dock);
        }
        
        if (window.Debugger) {
            window.Debugger.log('renderer', 'Rendered layout', { projectId: project.id });
        }
    },
    
    /**
     * Render empty state
     */
    _renderEmpty: function() {
        const container = document.getElementById('desktop-area') || document.body;
        
        // Clear existing
        this._clear();
        
        // Render empty message
        const empty = document.createElement('div');
        empty.id = 'renderer-empty';
        empty.className = 'fixed inset-0 flex items-center justify-center text-gray-500';
        empty.innerHTML = `
            <div class="text-center">
                <div class="text-4xl mb-4">📁</div>
                <div class="text-xl font-bold mb-2">No Project Active</div>
                <div class="text-sm">Create or open a project to begin</div>
            </div>
        `;
        
        container.appendChild(empty);
        this._renderedElements.set('empty', empty);
    },
    
    /**
     * Render panels
     * @param {Array} panels Panel definitions
     */
    _renderPanels: function(panels) {
        // Find or create panels container
        let container = document.getElementById('renderer-panels');
        if (!container) {
            container = document.createElement('div');
            container.id = 'renderer-panels';
            container.className = 'fixed inset-0 pointer-events-none z-10';
            document.body.appendChild(container);
        }
        
        // Clear existing panels
        container.innerHTML = '';
        
        // Render each panel
        panels.forEach((panel, index) => {
            const panelEl = this._createPanel(panel);
            if (panelEl) {
                container.appendChild(panelEl);
                this._renderedElements.set(`panel-${panel.id || index}`, panelEl);
            }
        });
    },
    
    /**
     * Create a panel element
     * @param {object} panel Panel definition
     * @returns {HTMLElement|null} Panel element
     */
    _createPanel: function(panel) {
        const el = document.createElement('div');
        el.className = `renderer-panel ${panel.className || ''}`;
        el.id = `panel-${panel.id || window.Utils ? window.Utils.shortId() : Date.now()}`;
        
        // Set position
        if (panel.position) {
            el.style.position = 'absolute';
            if (panel.position.top !== undefined) el.style.top = panel.position.top;
            if (panel.position.right !== undefined) el.style.right = panel.position.right;
            if (panel.position.bottom !== undefined) el.style.bottom = panel.position.bottom;
            if (panel.position.left !== undefined) el.style.left = panel.position.left;
            if (panel.position.width !== undefined) el.style.width = panel.position.width;
            if (panel.position.height !== undefined) el.style.height = panel.position.height;
        }
        
        // Set content
        if (panel.content) {
            if (typeof panel.content === 'string') {
                el.innerHTML = panel.content;
            } else if (panel.content.element) {
                el.appendChild(panel.content.element);
            }
        }
        
        // Set pointer events if needed
        if (panel.interactive) {
            el.style.pointerEvents = 'auto';
        }
        
        return el;
    },
    
    /**
     * Render windows
     * @param {Array} windows Window definitions
     */
    _renderWindows: function(windows) {
        // Windows are managed by WindowManager
        // This renderer just ensures they match the layout
        if (!window.WindowManager) {
            return;
        }
        
        // Note: WindowManager handles window creation/management
        // Renderer just syncs state
        windows.forEach(windowDef => {
            // WindowManager will handle actual window creation
            // This is just for declarative layout sync
        });
    },
    
    /**
     * Render dock
     * @param {Array} dock Dock item definitions
     */
    _renderDock: function(dock) {
        let container = document.getElementById('dock-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'dock-container';
            container.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50';
            document.body.appendChild(container);
        }
        
        // Clear existing dock items (keep system items)
        const existingDock = container.querySelector('#dock-apps');
        if (existingDock) {
            existingDock.innerHTML = '';
        }
        
        // Render dock items
        dock.forEach(item => {
            const itemEl = this._createDockItem(item);
            if (itemEl && existingDock) {
                existingDock.appendChild(itemEl);
            }
        });
    },
    
    /**
     * Create dock item element
     * @param {object} item Dock item definition
     * @returns {HTMLElement|null} Dock item element
     */
    _createDockItem: function(item) {
        const el = document.createElement('div');
        el.className = 'w-12 h-12 bg-gray-800/80 rounded-xl hover:-translate-y-2 transition-all flex items-center justify-center text-white shadow-lg border border-white/10 cursor-pointer';
        el.id = `dock-${item.id || window.Utils ? window.Utils.shortId() : Date.now()}`;
        
        // Set icon
        if (item.icon) {
            if (typeof item.icon === 'string') {
                el.innerHTML = `<span class="material-symbols-outlined text-2xl">${item.icon}</span>`;
            } else if (item.icon.url) {
                el.innerHTML = `<img src="${item.icon.url}" class="w-8 h-8 object-contain">`;
            }
        }
        
        // Set title
        if (item.title) {
            el.title = item.title;
        }
        
        // Set click handler (delegated to WindowManager or Widgets)
        if (item.action) {
            el.onclick = () => {
                if (item.action === 'widget.open' && item.widgetId && window.Widgets) {
                    window.Widgets.open(item.widgetId, item.options || {});
                } else if (item.action === 'window.open' && window.WindowManager) {
                    // WindowManager handles this
                }
            };
        }
        
        return el;
    },
    
    /**
     * Update rendered element
     * @param {string} id Element ID
     * @param {object} updates Updates to apply
     */
    update: function(id, updates) {
        const element = this._renderedElements.get(id);
        if (!element) {
            return false;
        }
        
        // Update classes
        if (updates.className) {
            element.className = updates.className;
        }
        
        // Update styles
        if (updates.style) {
            Object.assign(element.style, updates.style);
        }
        
        // Update content
        if (updates.content !== undefined) {
            if (typeof updates.content === 'string') {
                element.innerHTML = updates.content;
            }
        }
        
        return true;
    },
    
    /**
     * Remove rendered element
     * @param {string} id Element ID
     */
    remove: function(id) {
        const element = this._renderedElements.get(id);
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
            this._renderedElements.delete(id);
            return true;
        }
        return false;
    },
    
    /**
     * Clear all rendered elements
     */
    _clear: function() {
        this._renderedElements.forEach((element, id) => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        this._renderedElements.clear();
    },
    
    /**
     * Get current layout
     * @returns {object|null} Current layout
     */
    getLayout: function() {
        return this._currentLayout;
    },
    
    /**
     * Render widget UI
     * @param {string} widgetId Widget ID
     * @param {object} instance Widget instance
     * @param {HTMLElement} container Container element
     * @returns {HTMLElement|null} Rendered widget element
     */
    renderWidget: function(widgetId, instance, container) {
        const widget = window.Widgets ? window.Widgets.get(widgetId) : null;
        if (!widget) {
            return null;
        }
        
        // Check if widget has UI renderer
        if (widget.ui && typeof widget.ui === 'function') {
            try {
                const widgetEl = widget.ui(instance, container);
                if (widgetEl instanceof HTMLElement) {
                    container.appendChild(widgetEl);
                    return widgetEl;
                }
            } catch (e) {
                if (window.Debugger) {
                    window.Debugger.logError(`Widget UI render failed: ${widgetId}`, e);
                }
            }
        }
        
        // Fallback: render default widget UI
        const defaultEl = document.createElement('div');
        defaultEl.className = 'widget-default';
        defaultEl.innerHTML = `
            <div class="p-4 border border-gray-700 rounded">
                <h3 class="font-bold mb-2">${widget.name || widgetId}</h3>
                <p class="text-sm text-gray-400">Widget UI not available</p>
            </div>
        `;
        container.appendChild(defaultEl);
        return defaultEl;
    },
    
    /**
     * Render project switcher UI
     * @param {HTMLElement} container Container element
     */
    renderProjectSwitcher: function(container) {
        if (!window.Workspace) return;
        
        const projects = window.Workspace.getAllProjects();
        const activeProject = window.Workspace.getActiveProject();
        
        const switcher = document.createElement('div');
        switcher.className = 'project-switcher';
        switcher.innerHTML = `
            <div class="p-2 border-b border-gray-700">
                <h3 class="text-sm font-bold mb-2">Projects</h3>
            </div>
            <div class="overflow-y-auto">
                ${projects.map(project => `
                    <div class="p-2 hover:bg-gray-800 cursor-pointer ${activeProject && activeProject.id === project.id ? 'bg-blue-900/30' : ''}" 
                         data-project-id="${project.id}">
                        <div class="font-medium text-sm">${window.Utils ? window.Utils.escapeHtml(project.meta.name) : project.meta.name}</div>
                        <div class="text-xs text-gray-500">${project.meta.description || 'No description'}</div>
                    </div>
                `).join('')}
            </div>
        `;
        
        // Add click handlers
        switcher.querySelectorAll('[data-project-id]').forEach(el => {
            el.onclick = () => {
                const projectId = el.getAttribute('data-project-id');
                if (window.Workspace) {
                    window.Workspace.switchProject(projectId);
                }
            };
        });
        
        container.appendChild(switcher);
        return switcher;
    }
};

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.Renderer.init());
} else {
    window.Renderer.init();
}

