// --- MODULE: DATABASE (IndexedDB Wrapper + VFS) ---
// Virtual File System abstraction with namespace isolation

let dbInstance;
const DB_NAME = 'fb_builder_v1';
const DB_VERSION = 2; // Incremented for VFS support
const STORE_APPS = 'apps';      // Legacy: apps/projects
const STORE_PROJECTS = 'projects'; // New: Projects namespace
const STORE_FILES = 'files';     // New: VFS files namespace
const STORE_SETTINGS = 'settings'; // New: Settings namespace

window.DB = {
    /**
     * Initialize database
     */
    init: async function() {
        return new Promise((resolve, reject) => {
            if (dbInstance) {
                resolve(dbInstance);
                return;
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Legacy apps store (backward compatibility)
                if (!db.objectStoreNames.contains(STORE_APPS)) {
                    db.createObjectStore(STORE_APPS, { keyPath: 'id' });
                }
                
                // Projects store
                if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
                    db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
                }
                
                // Files store (VFS) - composite key: namespace + path
                if (!db.objectStoreNames.contains(STORE_FILES)) {
                    const filesStore = db.createObjectStore(STORE_FILES, { keyPath: ['namespace', 'path'] });
                    filesStore.createIndex('namespace', 'namespace', { unique: false });
                    filesStore.createIndex('path', 'path', { unique: false });
                }
                
                // Settings store
                if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                    const settingsStore = db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
                    settingsStore.createIndex('scope', 'scope', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                
                if (window.Debugger) {
                    window.Debugger.log('db', 'Database initialized', { 
                        name: DB_NAME, 
                        version: DB_VERSION 
                    });
                }
                
                resolve(dbInstance);
            };

            request.onerror = (event) => {
                const error = event.target.error;
                if (window.Debugger) {
                    window.Debugger.logError('Database connection failed', error);
                }
                reject(error);
            };
        });
    },
    
    // ============================================
    // Legacy API (Backward Compatibility)
    // ============================================
    
    /**
     * Legacy: Initialize DB (backward compatibility)
     */
    initLegacy: async function() {
        return this.init();
    },
    
    /**
     * Legacy: DB operation (backward compatibility)
     */
    op: async function(op, val) {
        // Check rules first
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: `db.${op}`,
                target: val ? (typeof val === 'string' ? val : val.id || '*') : '*',
                context: { operation: op }
            });
            
            if (!result.allowed) {
                throw new Error(`DB operation denied: ${result.reason}`);
            }
        }
        
        await this.init();
        
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction([STORE_APPS], 'readwrite');
            const store = tx.objectStore(STORE_APPS);
            let req;

            try {
                switch (op) {
                    case 'put':
                        req = store.put(val);
                        break;
                    case 'get':
                        if (val) req = store.get(val);
                        else req = store.getAll();
                        break;
                    case 'delete':
                        req = store.delete(val);
                        break;
                    default:
                        reject(new Error(`Unknown DB operation: ${op}`));
                        return;
                }

                req.onsuccess = () => {
                    if (window.Debugger) {
                        window.Debugger.logDBOp(op, STORE_APPS, { target: val });
                    }
                    resolve(req.result);
                };
                req.onerror = () => reject(req.error);
                
            } catch (e) {
                if (window.Debugger) {
                    window.Debugger.logError('DB operation error', e, { operation: op, value: val });
                }
                reject(e);
            }
        });
    },
    
    // ============================================
    // Project API (VFS Namespace)
    // ============================================
    
    /**
     * Save a project
     * @param {object} project
     * @returns {Promise}
     */
    saveProject: async function(project) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'project.save',
                target: project.id,
                context: { project }
            });
            
            if (!result.allowed) {
                throw new Error(`Project save denied: ${result.reason}`);
            }
        }
        
        // Validate project
        if (window.Project && !window.Project.isValid(project)) {
            const validation = window.Project.validate(project);
            throw new Error(`Invalid project: ${validation.errors.join(', ')}`);
        }
        
        await this.init();
        
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction([STORE_PROJECTS], 'readwrite');
            const store = tx.objectStore(STORE_PROJECTS);
            
            // Update modified timestamp
            project.meta.modified = window.Utils ? window.Utils.now() : Date.now();
            
            const req = store.put(project);
            
            req.onsuccess = () => {
                if (window.Debugger) {
                    window.Debugger.logDBOp('write', STORE_PROJECTS, { projectId: project.id });
                }
                resolve(project);
            };
            
            req.onerror = () => {
                if (window.Debugger) {
                    window.Debugger.logError('Project save failed', req.error, { projectId: project.id });
                }
                reject(req.error);
            };
        });
    },
    
    /**
     * Get a project by ID
     * @param {string} projectId
     * @returns {Promise<object|null>}
     */
    getProject: async function(projectId) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'project.open',
                target: projectId,
                context: {}
            });
            
            if (!result.allowed) {
                throw new Error(`Project access denied: ${result.reason}`);
            }
        }
        
        await this.init();
        
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction([STORE_PROJECTS], 'readonly');
            const store = tx.objectStore(STORE_PROJECTS);
            const req = store.get(projectId);
            
            req.onsuccess = () => {
                if (window.Debugger) {
                    window.Debugger.logDBOp('read', STORE_PROJECTS, { projectId });
                }
                resolve(req.result || null);
            };
            
            req.onerror = () => reject(req.error);
        });
    },
    
    /**
     * Get all projects
     * @returns {Promise<Array>}
     */
    getAllProjects: async function() {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction([STORE_PROJECTS], 'readonly');
            const store = tx.objectStore(STORE_PROJECTS);
            const req = store.getAll();
            
            req.onsuccess = () => {
                if (window.Debugger) {
                    window.Debugger.logDBOp('read', STORE_PROJECTS, { count: req.result.length });
                }
                resolve(req.result || []);
            };
            
            req.onerror = () => reject(req.error);
        });
    },
    
    /**
     * Delete a project
     * @param {string} projectId
     * @returns {Promise}
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
        
        await this.init();
        
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction([STORE_PROJECTS, STORE_FILES], 'readwrite');
            const projectStore = tx.objectStore(STORE_PROJECTS);
            const filesStore = tx.objectStore(STORE_FILES);
            
            // Delete project
            const deleteReq = projectStore.delete(projectId);
            
            deleteReq.onsuccess = () => {
                // Delete all files in project namespace
                const index = filesStore.index('namespace');
                const range = IDBKeyRange.only(projectId);
                const filesReq = index.openCursor(range);
                
                filesReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    } else {
                        if (window.Debugger) {
                            window.Debugger.logDBOp('delete', STORE_PROJECTS, { projectId });
                        }
                        resolve();
                    }
                };
                
                filesReq.onerror = () => reject(filesReq.error);
            };
            
            deleteReq.onerror = () => reject(deleteReq.error);
        });
    },
    
    // ============================================
    // VFS API (File System)
    // ============================================
    
    /**
     * Write a file to VFS
     * @param {string} namespace Project ID or namespace
     * @param {string} path File path
     * @param {*} content File content
     * @param {string} type File type ('text' or 'blob')
     * @returns {Promise}
     */
    writeFile: async function(namespace, path, content, type = 'text') {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'db.write',
                target: path,
                context: { namespace, type }
            });
            
            if (!result.allowed) {
                throw new Error(`File write denied: ${result.reason}`);
            }
        }
        
        await this.init();
        
        const normalizedPath = window.Utils ? window.Utils.normalizePath(path) : path;
        
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction([STORE_FILES], 'readwrite');
            const store = tx.objectStore(STORE_FILES);
            
            const fileRecord = {
                namespace,
                path: normalizedPath,
                content,
                type,
                modified: window.Utils ? window.Utils.now() : Date.now()
            };
            
            const req = store.put(fileRecord);
            
            req.onsuccess = () => {
                if (window.Debugger) {
                    window.Debugger.logDBOp('write', STORE_FILES, { namespace, path: normalizedPath });
                }
                resolve(fileRecord);
            };
            
            req.onerror = () => reject(req.error);
        });
    },
    
    /**
     * Read a file from VFS
     * @param {string} namespace
     * @param {string} path
     * @returns {Promise<object|null>}
     */
    readFile: async function(namespace, path) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'db.read',
                target: path,
                context: { namespace }
            });
            
            if (!result.allowed) {
                throw new Error(`File read denied: ${result.reason}`);
            }
        }
        
        await this.init();
        
        const normalizedPath = window.Utils ? window.Utils.normalizePath(path) : path;
        
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction([STORE_FILES], 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const req = store.get([namespace, normalizedPath]);
            
            req.onsuccess = () => {
                if (window.Debugger) {
                    window.Debugger.logDBOp('read', STORE_FILES, { namespace, path: normalizedPath });
                }
                resolve(req.result || null);
            };
            
            req.onerror = () => reject(req.error);
        });
    },
    
    /**
     * Delete a file from VFS
     * @param {string} namespace
     * @param {string} path
     * @returns {Promise}
     */
    deleteFile: async function(namespace, path) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'db.delete',
                target: path,
                context: { namespace }
            });
            
            if (!result.allowed) {
                throw new Error(`File delete denied: ${result.reason}`);
            }
        }
        
        await this.init();
        
        const normalizedPath = window.Utils ? window.Utils.normalizePath(path) : path;
        
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction([STORE_FILES], 'readwrite');
            const store = tx.objectStore(STORE_FILES);
            const req = store.delete([namespace, normalizedPath]);
            
            req.onsuccess = () => {
                if (window.Debugger) {
                    window.Debugger.logDBOp('delete', STORE_FILES, { namespace, path: normalizedPath });
                }
                resolve();
            };
            
            req.onerror = () => reject(req.error);
        });
    },
    
    /**
     * List files in a namespace
     * @param {string} namespace
     * @param {string} prefix Optional path prefix filter
     * @returns {Promise<Array>}
     */
    listFiles: async function(namespace, prefix = '') {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const tx = dbInstance.transaction([STORE_FILES], 'readonly');
            const store = tx.objectStore(STORE_FILES);
            const index = store.index('namespace');
            const range = IDBKeyRange.only(namespace);
            const req = index.openCursor(range);
            
            const files = [];
            const normalizedPrefix = window.Utils ? window.Utils.normalizePath(prefix) : prefix;
            
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const file = cursor.value;
                    if (!normalizedPrefix || file.path.startsWith(normalizedPrefix)) {
                        files.push({
                            path: file.path,
                            type: file.type,
                            modified: file.modified
                        });
                    }
                    cursor.continue();
                } else {
                    resolve(files);
                }
            };
            
            req.onerror = () => reject(req.error);
        });
    },
    
    /**
     * Export project files as object (for export pipeline)
     * @param {string} namespace
     * @returns {Promise<object>} Files object {path: {content, type}}
     */
    exportProjectFiles: async function(namespace) {
        const files = await this.listFiles(namespace);
        const filesObj = {};
        
        for (const file of files) {
            const fileData = await this.readFile(namespace, file.path);
            if (fileData) {
                filesObj[file.path] = {
                    content: fileData.content,
                    type: fileData.type
                };
            }
        }
        
        return filesObj;
    },
    
    /**
     * Import files into namespace
     * @param {string} namespace
     * @param {object} files {path: {content, type}}
     * @returns {Promise}
     */
    importProjectFiles: async function(namespace, files) {
        const promises = Object.keys(files).map(path => {
            const file = files[path];
            return this.writeFile(namespace, path, file.content, file.type || 'text');
        });
        
        await Promise.all(promises);
    }
};

// ============================================
// Backward Compatibility Wrappers
// ============================================

window.initDB = async function() {
    return window.DB.init();
};

window.dbOp = async function(op, val) {
    return window.DB.op(op, val);
};

window.dbPut = async function(app) {
    return window.DB.op('put', app);
};
