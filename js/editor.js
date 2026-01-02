// --- MODULE: EDITOR 7.5 (Deep Dive Refinement) ---

window.Editor = {
    // State
    state: {
        files: {},           
        activeFilePath: null,
        appId: null,
        mode: 'split',       
        blobs: [],           
        consoleOpen: true,
        expandedFolders: new Set(), // Persist folder state
        initialized: false,
        iconData: null,
        hasUnsavedChanges: false,
        deepTestMode: false 
    },

    // --- Core Lifecycle ---

    open: function(appId = null) {
        if (window.systemMode !== 'edit') {
            if(window.notify) window.notify("Switch to EDIT MODE to use Code Studio", true);
            return;
        }

        const appWin = document.getElementById('editor-app');
        if(!appWin) return;
        
        appWin.classList.remove('hidden', 'minimized');
        if(window.WindowManager) {
            WindowManager.zIndex++;
            appWin.style.zIndex = WindowManager.zIndex;
        }
        
        this.state.appId = appId;
        this.revokeBlobs();

        if (!this.state.initialized) {
            this.initDeepIntegrations();
            this.bindShortcuts();
            this.state.initialized = true;
        }

        if (appId) {
            this.loadApp(appId);
        } else {
            this.resetToEmpty();
        }

        this.setLayout(this.state.mode);
        this.updateCategoryDropdown();
        this.state.hasUnsavedChanges = false;
        this.updateUnsavedIndicator();
        
        // Restore Console State
        this.toggleConsole(this.state.consoleOpen);
    },

    close: function() {
        if (this.state.hasUnsavedChanges) {
            if(!confirm("You have unsaved changes. Discard them?")) return;
        }
        document.getElementById('editor-app').classList.add('hidden');
        this.state.hasUnsavedChanges = false;
        this.updateUnsavedIndicator();
    },

    // --- Project Management Controls ---

    newFile: function() {
        const path = prompt("Enter file path (e.g., src/main.js):", "");
        if (!path) return;
        
        // Fallback if global normalizePath is missing
        const cleanPath = window.normalizePath ? window.normalizePath(path) : path.replace(/^\/+/, '').trim();
        
        if (this.state.files[cleanPath]) {
            if(window.notify) window.notify("File already exists", true);
            return;
        }

        // Detect type
        const isCss = cleanPath.endsWith('.css');
        const isHtml = cleanPath.endsWith('.html');
        const isJs = cleanPath.endsWith('.js') || cleanPath.endsWith('.jsx');
        const isJson = cleanPath.endsWith('.json');
        
        let content = "";
        if (isHtml) content = "<!DOCTYPE html>\n<html>\n<body>\n\n</body>\n</html>";
        if (isJs) content = "// New File\n";
        if (isCss) content = "/* New Styles */\n";
        if (isJson) content = "{}";

        this.state.files[cleanPath] = { content: content, type: 'text' };
        
        // Auto-expand folders to show new file
        const parts = cleanPath.split('/');
        let currentPath = "";
        for(let i=0; i<parts.length-1; i++) {
            currentPath += (i===0 ? "" : "/") + parts[i];
            this.state.expandedFolders.add(currentPath);
        }

        this.renderTree();
        this.switchFile(cleanPath);
        this.markUnsaved();
    },

    deleteFile: function(path) {
        if (!path) return;
        if(!confirm(`Delete "${path}"?`)) return;
        
        delete this.state.files[path];
        
        // CRITICAL FIX: If we deleted the last file, reset the project to avoid "Dead Editor" state
        if (Object.keys(this.state.files).length === 0) {
            if(window.notify) window.notify("Project empty. Resetting to default.");
            this.resetToEmpty();
            return;
        }
        
        if (this.state.activeFilePath === path) {
            this.state.activeFilePath = null;
            if(window.editorCM) window.editorCM.setValue("");
            // Try to switch to index.html or first available
            const next = this.findEntryPoint();
            if(next) this.switchFile(next);
        }
        
        this.renderTree();
        this.markUnsaved();
        this.refreshPreview();
    },

    deleteProject: async function() {
        if(!this.state.appId) return;
        if(!confirm("Permanently delete this project? This cannot be undone.")) return;

        try {
            if(window.dbOp) await window.dbOp('delete', this.state.appId);
            if(window.notify) window.notify("Project Deleted");
            if(window.refreshApps) window.refreshApps();
            
            // Close editor
            this.state.hasUnsavedChanges = false; // Bypass check
            document.getElementById('saveOptionsModal').classList.add('hidden');
            document.getElementById('editor-app').classList.add('hidden');
        } catch(e) {
            console.error(e);
            if(window.notify) window.notify("Delete failed", true);
        }
    },

    // --- Import Engine ---

    triggerFolderImport: function() {
        const oldInput = document.getElementById('folderImportInput');
        if(oldInput) oldInput.remove();

        const input = document.createElement('input');
        input.id = 'folderImportInput';
        input.type = 'file';
        input.setAttribute('webkitdirectory', '');
        input.setAttribute('directory', '');
        input.setAttribute('multiple', '');
        input.style.display = 'none';
        
        // Reset value to ensure onchange fires even if same folder selected twice
        input.value = ''; 
        
        input.onchange = (e) => this.handleInputImport(e);
        document.body.appendChild(input);
        setTimeout(() => input.click(), 50);
    },

    handleInputImport: async function(e) {
        const files = Array.from(e.target.files);
        if(files.length === 0) return;
        if(window.notify) window.notify(`Reading ${files.length} items...`);

        const batch = files.map(f => ({ 
            entry: f, 
            path: f.webkitRelativePath || f.name 
        }));
        
        await this.processImportBatch(batch);
    },

    handleDropImport: async function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const items = e.dataTransfer.items;
        const entries = [];
        
        for (let i = 0; i < items.length; i++) {
            const item = items[i].webkitGetAsEntry();
            if (item) {
                await this.scanEntryRecursive(item, "", entries);
            }
        }
        
        if (entries.length > 0) {
            await this.processImportBatch(entries);
        }
    },

    scanEntryRecursive: async function(entry, path, resultList) {
        if (entry.isFile) {
            return new Promise((resolve) => {
                entry.file((file) => {
                    const fullPath = (path + file.name).replace(/\/+/g, '/');
                    resultList.push({ entry: file, path: fullPath });
                    resolve();
                });
            });
        } else if (entry.isDirectory) {
            const reader = entry.createReader();
            let entriesBatch = [];
            const readBatch = async () => {
                return new Promise((resolve, reject) => {
                    reader.readEntries(resolve, reject);
                });
            };

            try {
                do {
                    entriesBatch = await readBatch();
                    const promises = entriesBatch.map(child => 
                        this.scanEntryRecursive(child, path + entry.name + "/", resultList)
                    );
                    await Promise.all(promises);
                } while (entriesBatch.length > 0);
            } catch (err) {
                console.warn("Dir read error:", err);
            }
        }
    },

    processImportBatch: async function(fileObjects) {
        // A. Filter Junk Files
        const validFiles = fileObjects.filter(f => {
            const p = f.path;
            if (p.includes('__MACOSX') || p.includes('.DS_Store') || p.includes('Desktop.ini') || p.includes('Thumbs.db')) return false;
            if (p.includes('.git/') || p.includes('node_modules/')) return false;
            return true;
        });

        if (validFiles.length === 0) {
            if(window.notify) window.notify("No valid source files found.", true);
            return;
        }

        // B. Root Detection Logic
        const firstPath = validFiles[0].path;
        const rootMatch = firstPath.match(/^([^/]+)\//);
        let rootPrefix = "";
        
        if (rootMatch) {
            const potentialRoot = rootMatch[1];
            const allMatch = validFiles.every(f => f.path.startsWith(potentialRoot + "/"));
            if (allMatch) {
                rootPrefix = potentialRoot + "/";
                this.setFieldValue('inName', potentialRoot);
            }
        }

        const newVFS = {};
        const textExtensions = new Set(['js','jsx','ts','tsx','html','css','scss','json','md','txt','svg','xml','gitignore','env']);

        const promises = validFiles.map(async (f) => {
            const rawPath = f.path;
            let finalPath = rawPath.startsWith(rootPrefix) ? rawPath.slice(rootPrefix.length) : rawPath;
            finalPath = window.normalizePath ? window.normalizePath(finalPath) : finalPath;
            
            if (!finalPath) return;

            const ext = finalPath.split('.').pop().toLowerCase();
            const isText = textExtensions.has(ext);

            try {
                if (isText) {
                    const text = await f.entry.text();
                    newVFS[finalPath] = { content: text, type: 'text' };
                } else {
                    newVFS[finalPath] = { content: f.entry, type: 'blob' };
                }
            } catch (e) {
                console.warn("Failed to read file:", finalPath);
            }
        });

        await Promise.all(promises);

        this.state.files = { ...this.state.files, ...newVFS };
        this.renderTree();
        const index = this.findEntryPoint();
        if(index) this.switchFile(index);
        
        if(window.notify) window.notify("Import Successful");
        this.refreshPreview();
        this.markUnsaved();
    },

    // --- Scaffold Generator ---
    
    toggleScaffold: function() { document.getElementById('scaffoldModal').classList.toggle('hidden'); },
    
    loadScaffoldPreset: function(val) {
        const presets = {
            todo: `todo-app/\n  index.html\n  style.css\n  app.js`,
            electron: `app/\n  package.json\n  main.js\n  index.html\n  renderer.js\n  src/\n    ui.js\n    utils.js`,
            landing: `landing/\n  index.html\n  assets/\n    logo.png\n  css/\n    style.css`,
            modular: `webapp/\n  index.html\n  styles/\n    style.css\n  js/\n    app.js\n    utils.js`
        };
        if(presets[val]) document.getElementById('scaffoldInput').value = presets[val];
    },

    buildFromScaffold: function() {
        const text = document.getElementById('scaffoldInput').value;
        if(!text.trim()) return;
        
        const root = this.parseAsciiTree(text);
        const files = {};
        
        const traverse = (nodes, parentPath) => {
            nodes.forEach(node => {
                const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
                if(node.type === 'file') {
                    let content = "";
                    if(node.name.endsWith('.html')) content = `<!DOCTYPE html>\n<html>\n<head>\n<title>${node.name}</title>\n</head>\n<body>\n<h1>${node.name}</h1>\n</body>\n</html>`;
                    if(node.name.endsWith('.js')) content = `console.log("Loaded ${node.name}");`;
                    if(node.name.endsWith('.css')) content = `body { font-family: sans-serif; }`;
                    if(node.name.endsWith('.json')) content = `{\n  "name": "app",\n  "version": "1.0.0"\n}`;
                    files[fullPath] = { content, type: 'text' };
                } else {
                    traverse(node.children, fullPath);
                }
            });
        };
        
        traverse(root, "");
        
        this.state.files = files;
        this.renderTree();
        this.toggleScaffold();
        
        const entry = this.findEntryPoint();
        if(entry) this.switchFile(entry);
        
        this.markUnsaved();
        this.refreshPreview();
        if(window.notify) window.notify("Scaffold Generated");
    },

    parseAsciiTree: function(text) {
        const lines = text.split('\n');
        const root = [];
        const stack = [{ level: -1, children: root }];
        
        lines.forEach(line => {
            if(!line.trim()) return;
            const match = line.match(/^[\s\u2500-\u257F\-|`\+]+/);
            const level = match ? Math.floor(match[0].length / 2) : 0;
            const name = line.replace(/^[\s\u2500-\u257F\-|`\+\*\>]+/, '').trim();
            const type = (name.endsWith('/') || !name.includes('.')) ? 'folder' : 'file';
            
            while(stack.length > 1 && stack[stack.length-1].level >= level) stack.pop();
            
            const node = { name: name.replace('/',''), type, children: [], level };
            stack[stack.length-1].children.push(node);
            
            if(type === 'folder') stack.push(node);
        });
        return root;
    },

    // --- Zip Export ---

    downloadZip: async function() {
        if(!window.JSZip) return window.notify("JSZip missing", true);
        const zip = new JSZip();
        const files = this.state.files;
        Object.keys(files).forEach(path => zip.file(path, files[path].content));
        const blob = await zip.generateAsync({type:"blob"});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (document.getElementById('inName').value || "project") + ".zip";
        a.click();
    },

    // --- Loading & Saving ---

    loadApp: async function(appId) {
        let app = (typeof all !== 'undefined' ? all : []).find(x => x.id === appId);
        if(window.dbOp) {
            const dbApp = await window.dbOp('get', appId);
            if(dbApp) app = dbApp; 
        }

        if(!app) return this.resetToEmpty();

        this.setFieldValue('inName', app.name);
        this.setFieldValue('inStack', app.stack || 'Development');
        this.state.iconData = app.iconData || null;
        this.updateIconPreview(this.state.iconData || app.iconUrl);
        this.setCheckValue('chkFav', app.isFavorite || false);
        this.setCheckValue('chkDesk', app.onDesktop || false);
        
        this.state.files = JSON.parse(JSON.stringify(app.files || {}));
        
        // Reset folders but keep root open
        this.state.expandedFolders.clear();
        
        this.renderTree();

        const entry = this.findEntryPoint();
        if(entry) this.switchFile(entry);
        else if (window.editorCM && app.html) window.editorCM.setValue(app.html);

        this.state.hasUnsavedChanges = false;
        this.updateUnsavedIndicator();
        this.refreshPreview();
    },

    saveProject: async function() {
        if(window.notify) window.notify("Saving...");
        this.syncCurrentFile();
        
        let stack = document.getElementById('inStack').value;
        if(stack === 'New Category') {
            stack = prompt("Enter new category name:");
            if(!stack) return;
        }

        const app = {
            id: this.state.appId || crypto.randomUUID(),
            name: document.getElementById('inName').value || "Untitled",
            stack: stack,
            iconData: this.state.iconData,
            onDesktop: document.getElementById('chkDesk').checked,
            isFavorite: document.getElementById('chkFav').checked,
            files: this.state.files,
            lastModified: Date.now()
        };
        
        try {
            // Electron Integration Bridge
            if (window.electronAPI && window.electronAPI.saveProject) {
                // If running in your future Electron wrapper
                await window.electronAPI.saveProject(app);
            } else if(window.dbPut) {
                // Web Environment
                await window.dbPut(app);
            }
            
            this.state.appId = app.id;
            this.state.hasUnsavedChanges = false;
            this.updateUnsavedIndicator();
            if(window.notify) window.notify("Saved Successfully!");
            if(window.refreshApps) window.refreshApps();
            document.getElementById('saveOptionsModal').classList.add('hidden');
        } catch(e) { 
            console.error(e);
            if(window.notify) window.notify("Save Failed", true); 
        }
    },

    // --- File Ops ---

    switchFile: function(path) {
        this.syncCurrentFile();
        this.state.activeFilePath = path;
        const file = this.state.files[path];
        if(!file) return;
        
        const isImage = this.isBinaryFile(path);
        const isSvg = path.toLowerCase().endsWith('.svg');
        
        // Always handle visual toggling first
        this.toggleImagePreview(isImage || isSvg, file);

        if (!isImage && window.editorCM) {
            // Safe guard for SVG which is both binary-like and text
            if(isSvg) this.toggleImagePreview(false, null); 
            
            // Explicitly set value to avoid CM retention issues
            window.editorCM.setValue(file.content || "");
            window.editorCM.setOption('readOnly', false);
            window.editorCM.clearHistory();
            
            const ext = path.split('.').pop().toLowerCase();
            const modeMap = { 
                'js': 'javascript', 'jsx': 'jsx', 'ts': 'text/typescript',
                'html': 'htmlmixed', 'css': 'css', 'json': 'application/json', 
                'md': 'markdown', 'xml': 'xml', 'svg': 'xml'
            };
            window.editorCM.setOption('mode', modeMap[ext] || 'htmlmixed');
            
            const modeDisplay = document.getElementById('sb-mode');
            if(modeDisplay) modeDisplay.textContent = modeMap[ext] || 'text';
        }
        
        this.highlightActiveFile(path);
        this.updateStatusBar();
        if(this.state.deepTestMode) this.refreshPreview(); 
    },

    refreshPreview: function() {
        const frame = document.getElementById('editorPreviewFrame');
        if(!frame) return;
        this.syncCurrentFile();
        
        let filesToRun = this.state.files;
        let entryPoint = null;

        if (this.state.deepTestMode && this.state.activeFilePath) {
            entryPoint = this.state.activeFilePath;
        }

        if(Object.keys(filesToRun).length === 0) return;

        if(window.WindowManager && window.WindowManager.launchApp) {
            window.WindowManager.launchApp({ name: "Preview", files: filesToRun }, entryPoint)
                .then(html => { frame.srcdoc = html; });
        }
        
        const appName = document.getElementById('inName').value || "App";
        const urlBar = document.getElementById('previewUrlBar');
        if(urlBar) urlBar.textContent = `local://${appName.toLowerCase().replace(/\s/g,'-')}/${this.state.activeFilePath||''}`;
    },

    launchExternalPreview: function() {
        // Deep Launch - creates a full standalone blob URL
        const frame = document.getElementById('editorPreviewFrame');
        if (!frame || !frame.srcdoc) return;

        const blob = new Blob([frame.srcdoc], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        
        // Cleanup blob after delay
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    },

    // --- Visualization & UI ---
    
    toggleConsole: function(forceState = null) {
        const con = document.getElementById('editorConsole');
        const icon = document.getElementById('consoleToggleIcon');
        if(!con) return;
        
        if (forceState !== null) {
            this.state.consoleOpen = forceState;
        } else {
            this.state.consoleOpen = !this.state.consoleOpen;
        }

        if (this.state.consoleOpen) {
            con.style.height = '128px'; 
            con.classList.remove('h-8'); // Minimized height
            if(icon) icon.innerText = 'expand_more';
        } else {
            con.style.height = '28px'; // Header only
            con.classList.add('h-8');
            if(icon) icon.innerText = 'expand_less';
        }
    },

    renderTree: function() {
        const treeContainer = document.getElementById('fileTreeContent');
        if(!treeContainer) return;
        treeContainer.innerHTML = '';
        const files = this.state.files;
        
        // Build hierarchy with Full Path tracking
        const root = { name: 'root', path: "", children: {}, files: [] };
        
        Object.keys(files).forEach(path => {
            const parts = path.split('/');
            const fileName = parts.pop();
            let current = root;
            let currentPath = "";
            
            parts.forEach(part => {
                currentPath += (currentPath ? "/" : "") + part;
                if (!current.children[part]) {
                    current.children[part] = { name: part, path: currentPath, children: {}, files: [] };
                }
                current = current.children[part];
            });
            current.files.push({ name: fileName, fullPath: path });
        });
        
        this.renderFolder(root, treeContainer, 0);
    },

    renderFolder: function(folder, container, depth) {
        // Sort folders first
        Object.keys(folder.children).sort().forEach(folderName => {
            const subFolder = folder.children[folderName];
            const fullPath = subFolder.path;
            
            const folderDiv = document.createElement('div');
            folderDiv.className = 'ml-2';
            
            // Check persistence state, default to open if root (depth 0)
            const isExpanded = this.state.expandedFolders.has(fullPath) || depth === 0; 
            
            const label = document.createElement('div');
            label.className = 'flex items-center gap-1 text-gray-400 hover:text-white cursor-pointer py-0.5 select-none';
            label.style.paddingLeft = `${depth * 8}px`;
            label.innerHTML = `<span class="material-symbols-outlined text-[14px] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}">chevron_right</span><span class="text-xs font-bold text-blue-200/70">${folderName}</span>`;
            
            const childrenContainer = document.createElement('div');
            childrenContainer.className = isExpanded ? 'block' : 'hidden';
            
            label.onclick = (e) => { 
                e.stopPropagation(); 
                const arrow = label.querySelector('.material-symbols-outlined'); 
                
                if (childrenContainer.classList.contains('hidden')) { 
                    childrenContainer.classList.remove('hidden'); 
                    arrow.classList.add('rotate-90'); 
                    this.state.expandedFolders.add(fullPath);
                } else { 
                    childrenContainer.classList.add('hidden'); 
                    arrow.classList.remove('rotate-90');
                    this.state.expandedFolders.delete(fullPath); 
                } 
            };
            
            folderDiv.appendChild(label); 
            folderDiv.appendChild(childrenContainer); 
            container.appendChild(folderDiv);
            
            this.renderFolder(subFolder, childrenContainer, depth + 1);
        });
        
        // Render files
        folder.files.sort((a,b) => a.name.localeCompare(b.name)).forEach(file => {
            const fileDiv = document.createElement('div');
            const isActive = file.fullPath === this.state.activeFilePath;
            
            fileDiv.className = `flex items-center gap-2 py-1 cursor-pointer text-xs rounded transition-colors group ${isActive ? 'bg-blue-900/40 text-blue-400' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'}`;
            fileDiv.style.paddingLeft = `${(depth * 8) + 16}px`; 
            fileDiv.id = `file-item-${file.fullPath.replace(/[^a-zA-Z0-9]/g, '-')}`;
            
            // Use DOM creation instead of innerHTML for safer event binding on the delete button
            const iconSpan = document.createElement('span');
            iconSpan.className = `material-symbols-outlined text-[14px] ${isActive ? 'text-blue-400' : 'text-gray-500'}`;
            iconSpan.textContent = this.getFileIcon(file.fullPath);

            const nameSpan = document.createElement('span');
            nameSpan.className = "truncate flex-1";
            nameSpan.textContent = file.name;

            const delBtn = document.createElement('button');
            delBtn.className = "opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition-opacity";
            delBtn.title = "Delete File";
            delBtn.innerHTML = `<span class="material-symbols-outlined text-[10px]">close</span>`;
            delBtn.onclick = (ev) => {
                ev.stopPropagation();
                this.deleteFile(file.fullPath);
            };

            fileDiv.appendChild(iconSpan);
            fileDiv.appendChild(nameSpan);
            fileDiv.appendChild(delBtn);

            fileDiv.onclick = (e) => { e.stopPropagation(); this.switchFile(file.fullPath); };
            container.appendChild(fileDiv);
        });
    },

    // --- Utils ---
    resetToEmpty: function() {
        this.state.appId = crypto.randomUUID();
        this.state.iconData = null;
        this.updateIconPreview(null);
        
        // REFINED: Matches your preferred Electron/Modular folder structure
        this.state.files = {
            'index.html': { 
                content: '<!DOCTYPE html>\n<html>\n<head>\n  <link rel="stylesheet" href="styles/style.css">\n</head>\n<body>\n  <h1>New Project</h1>\n  <script src="js/app.js"></script>\n</body>\n</html>', 
                type: 'text' 
            },
            'styles/style.css': { 
                content: 'body { background: #111; color: white; font-family: sans-serif; }', 
                type: 'text' 
            },
            'js/app.js': { 
                content: 'console.log("Hello World");', 
                type: 'text' 
            }
        };
        
        this.state.activeFilePath = 'index.html';
        this.state.expandedFolders.clear();
        this.state.expandedFolders.add('styles');
        this.state.expandedFolders.add('js');
        
        this.setFieldValue('inName', "Untitled Project");
        this.setFieldValue('inStack', "Development");
        this.renderTree();
        if(window.editorCM) window.editorCM.setValue(this.state.files['index.html'].content);
        setTimeout(() => this.toggleScaffold(), 300);
        this.state.hasUnsavedChanges = false;
        this.refreshPreview();
    },

    syncCurrentFile: function() {
        if (this.state.activeFilePath && this.state.files[this.state.activeFilePath]) {
            if(this.state.files[this.state.activeFilePath].type === 'text' && window.editorCM) {
                const currentVal = window.editorCM.getValue();
                if (this.state.files[this.state.activeFilePath].content !== currentVal) {
                    this.state.files[this.state.activeFilePath].content = currentVal;
                    this.markUnsaved(); 
                }
            }
        }
    },

    toggleDeepTest: function() {
        this.state.deepTestMode = !this.state.deepTestMode;
        const btn = document.getElementById('btnDeepTest');
        if(btn) {
            if(this.state.deepTestMode) {
                btn.classList.add('text-green-400', 'bg-green-400/10');
                if(window.notify) window.notify("Deep Test ON: Running Active File");
            } else {
                btn.classList.remove('text-green-400', 'bg-green-400/10');
                if(window.notify) window.notify("Deep Test OFF: Running Full App");
            }
        }
        this.refreshPreview();
    },

    hasUnsavedChanges: function() { return this.state.hasUnsavedChanges; },
    markUnsaved: function() { this.state.hasUnsavedChanges = true; this.updateUnsavedIndicator(); },
    updateUnsavedIndicator: function() { const nameInput = document.getElementById('inName'); if(!nameInput) return; if (this.state.hasUnsavedChanges) { nameInput.classList.add('border-yellow-500'); nameInput.title = "Unsaved Changes"; } else { nameInput.classList.remove('border-yellow-500'); nameInput.title = ""; } },
    updateStatusBar: function() { const fileEl = document.getElementById('sb-file'); if(fileEl) fileEl.textContent = this.state.activeFilePath || 'No file'; },
    highlightActiveFile: function(path) { document.querySelectorAll('[id^="file-item-"]').forEach(el => el.classList.remove('bg-blue-900/40', 'text-blue-400')); const activeEl = document.getElementById(`file-item-${path.replace(/[^a-zA-Z0-9]/g, '-')}`); if(activeEl) activeEl.classList.add('bg-blue-900/40', 'text-blue-400'); },
    setLayout: function(mode) { this.state.mode = mode; const container = document.getElementById('editorContainer'); const preview = document.getElementById('editorPreviewPane'); const btns = ['btnViewCode', 'btnViewSplit', 'btnViewPreview']; btns.forEach(b => { const el = document.getElementById(b); if(el) el.classList.remove('text-white', 'bg-white/10'); }); const activeBtn = mode === 'code' ? 'btnViewCode' : mode === 'preview' ? 'btnViewPreview' : 'btnViewSplit'; const el = document.getElementById(activeBtn); if(el) el.classList.add('text-white', 'bg-white/10'); container.classList.remove('hidden', 'w-full', 'w-1/2'); preview.classList.remove('hidden', 'w-full', 'w-1/2'); if (mode === 'code') { container.classList.add('w-full'); preview.classList.add('hidden'); } else if (mode === 'preview') { container.classList.add('hidden'); preview.classList.add('w-full'); this.refreshPreview(); } else { container.classList.add('w-1/2'); preview.classList.add('w-1/2'); this.refreshPreview(); } if(window.editorCM) window.editorCM.refresh(); },
    
    bindShortcuts: function() { 
        window.addEventListener('keydown', (e) => { 
            // Save: Ctrl/Cmd + S
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { 
                e.preventDefault(); 
                this.toggleSaveOptions(); 
                return;
            } 

            // Delete File: Delete or Backspace
            // CRITICAL: We must check if the user is typing in an input or the CodeMirror editor.
            // If they are, do NOT delete the file.
            const isInputActive = document.activeElement.tagName === 'INPUT' || 
                                  document.activeElement.tagName === 'TEXTAREA' || 
                                  document.activeElement.isContentEditable;
            
            const isCmFocused = window.editorCM && window.editorCM.hasFocus();

            if (!isInputActive && !isCmFocused) {
                 if (e.key === 'Delete' || (e.key === 'Backspace' && !e.metaKey && !e.ctrlKey)) {
                    // Safety check: ensure a file is selected
                    if (this.state.activeFilePath) {
                        e.preventDefault(); // Prevent browser "Back" navigation on Backspace
                        this.deleteFile(this.state.activeFilePath);
                    }
                 }
            }
        }); 
    },
    
    initDeepIntegrations: function() { 
        const app = document.getElementById('editor-app'); 
        const overlay = document.createElement('div'); 
        overlay.className = 'absolute inset-0 bg-blue-500/20 border-2 border-blue-400 hidden z-50 flex items-center justify-center text-blue-200 text-xl font-bold backdrop-blur-sm pointer-events-none'; 
        overlay.innerText = 'Drop folder to import'; 
        overlay.id = 'drop-overlay'; 
        app.appendChild(overlay); 
        app.addEventListener('dragover', (e) => { e.preventDefault(); document.getElementById('drop-overlay').classList.remove('hidden'); }); 
        app.addEventListener('dragleave', (e) => { e.preventDefault(); document.getElementById('drop-overlay').classList.add('hidden'); }); 
        app.addEventListener('drop', (e) => { e.preventDefault(); document.getElementById('drop-overlay').classList.add('hidden'); this.handleDropImport(e); }); 
        
        const container = document.getElementById('editorContainer'); 
        if(container && !document.getElementById('editor-status-bar')) { 
            const sb = document.createElement('div'); 
            sb.id = 'editor-status-bar'; 
            sb.className = 'absolute bottom-0 left-0 right-0 bg-[#191a21] text-gray-500 text-[10px] px-2 py-1 flex justify-between border-t border-gray-800 z-20'; 
            sb.innerHTML = `<div class="flex gap-4"><span id="sb-file">No file</span> <span id="sb-mode"></span></div> <span id="sb-cursor">Ln 1, Col 1</span>`; 
            container.appendChild(sb); 
        } 
        
        if(window.editorCM) { 
            window.editorCM.on('cursorActivity', (cm) => { 
                const pos = cm.getCursor(); 
                const el = document.getElementById('sb-cursor'); 
                if(el) el.textContent = `Ln ${pos.line + 1}, Col ${pos.ch + 1}`; 
            }); 
            window.editorCM.on('change', () => { 
                this.updateStatusBar(); 
                this.markUnsaved(); 
            }); 
        }

        // FIX: Bind Window Controls
        const win = document.getElementById('editor-app');
        if(win) {
            // Red Close Button
            const closeBtn = win.querySelector('.window-close');
            if(closeBtn) {
                closeBtn.onclick = (e) => { e.stopPropagation(); this.close(); };
            }
            
            // Green Maximize Button (3rd in group)
            const trafficLights = win.querySelectorAll('.flex.gap-2.group button');
            if(trafficLights[2]) {
                trafficLights[2].onclick = (e) => { 
                    e.stopPropagation(); 
                    if(window.WindowManager) window.WindowManager.maximize('editor-app'); 
                };
            }
        }
        
        // Fix New File Button (+ icon in sidebar) with multiple fallbacks
        const newFileBtn = document.querySelector('#editor-app button[title="New File"]') ||
                           document.getElementById('btnNewFile') ||
                           Array.from(document.querySelectorAll('#editor-app button')).find(b => b.innerText.trim() === 'note_add');

        if(newFileBtn) {
             newFileBtn.onclick = (e) => { 
                 e.stopPropagation(); 
                 this.newFile(); 
             };
        }
    },
    
    setFieldValue: function(id, val) { const el = document.getElementById(id); if(el) el.value = val; },
    setCheckValue: function(id, val) { const el = document.getElementById(id); if(el) el.checked = val; },
    revokeBlobs: function() { this.state.blobs.forEach(url => URL.revokeObjectURL(url)); this.state.blobs = []; },
    getFileIcon: function(path) { if(path.endsWith('.js') || path.endsWith('.jsx')) return 'javascript'; if(path.endsWith('.css')) return 'css'; if(path.endsWith('.html')) return 'html'; if(path.endsWith('.json')) return 'data_object'; if(this.isBinaryFile(path)) return 'image'; return 'description'; },
    isBinaryFile: function(path) { return /\.(png|jpg|jpeg|gif|webp|ico|mp3|mp4|svg|ttf|woff)$/i.test(path); },
    toggleImagePreview: function(show, file) { const img = document.getElementById('editor-image-view'); const cm = document.querySelector('.CodeMirror'); if(!img) return; if(show && file) { if(cm) cm.style.display = 'none'; img.classList.remove('hidden'); let src = ''; if(file.type === 'blob' || file.content instanceof Blob) src = URL.createObjectURL(file.content); else if (typeof file.content === 'string' && file.content.startsWith('<svg')) { const blob = new Blob([file.content], {type: 'image/svg+xml'}); src = URL.createObjectURL(blob); } img.querySelector('img').src = src; } else { if(cm) cm.style.display = 'block'; img.classList.add('hidden'); } },
    findEntryPoint: function() { const f = this.state.files; return Object.keys(f).find(k => k.toLowerCase().endsWith('index.html')) || Object.keys(f)[0]; },
    updateCategoryDropdown: function() { const select = document.getElementById('inStack'); if(!select) return; },
    updateIconPreview: function(src) { const previewEl = document.getElementById('iconPreviewImg'); const placeholder = document.getElementById('iconPlaceholder'); if(previewEl && placeholder) { if(src) { previewEl.src = src; previewEl.classList.remove('hidden'); placeholder.classList.add('hidden'); } else { previewEl.classList.add('hidden'); placeholder.classList.remove('hidden'); } } },
    triggerIconUpload: function() { let input = document.getElementById('iconUploadInput'); if(!input) { input = document.createElement('input'); input.id = 'iconUploadInput'; input.type = 'file'; input.accept = '.png,.jpg,.jpeg,.ico,.svg'; input.style.display = 'none'; input.onchange = (e) => this.handleIconFile(e); document.body.appendChild(input); } input.click(); },
    handleIconFile: function(e) { const file = e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (evt) => { this.state.iconData = evt.target.result; this.updateIconPreview(this.state.iconData); this.markUnsaved(); }; reader.readAsDataURL(file); },
    toggleSaveOptions: function() { document.getElementById('saveOptionsModal').classList.toggle('hidden'); }
};
