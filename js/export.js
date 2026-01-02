// --- MODULE: EXPORT (Export Pipeline) ---
// Generates static HTML/CSS/JS files for deployment
// Deterministic output - GitHub Pages compatible

window.Export = {
    // Export settings defaults
    DEFAULT_SETTINGS: {
        minify: false,
        inlineAssets: false,
        cspEnabled: true,
        cdnAllowed: true
    },
    
    /**
     * Export a project to static files
     * @param {string} projectId Project ID
     * @param {object} options Export options
     * @returns {Promise<object>} Export result {files: {}, manifest: {}}
     */
    exportProject: async function(projectId, options = {}) {
        // Check rules
        if (window.Rules) {
            const result = window.Rules.evaluate({
                action: 'project.export',
                target: projectId,
                context: { options }
            });
            
            if (!result.allowed) {
                throw new Error(`Export denied: ${result.reason}`);
            }
        }
        
        // Get project
        let project;
        if (window.Workspace) {
            project = window.Workspace.getProject(projectId);
            if (!project && window.DB) {
                project = await window.DB.getProject(projectId);
            }
        } else if (window.DB) {
            project = await window.DB.getProject(projectId);
        }
        
        if (!project) {
            throw new Error(`Project not found: ${projectId}`);
        }
        
        // Validate project
        if (window.Project && !window.Project.isValid(project)) {
            const validation = window.Project.validate(project);
            throw new Error(`Invalid project: ${validation.errors.join(', ')}`);
        }
        
        // Merge export settings
        const exportSettings = {
            ...this.DEFAULT_SETTINGS,
            ...project.exports.settings,
            ...options
        };
        
        // Get project files from VFS
        let files = {};
        if (window.DB && project.assets && project.assets.files) {
            // Use VFS files if available
            files = await window.DB.exportProjectFiles(projectId);
        } else if (project.assets && project.assets.files) {
            // Fallback to project.assets.files
            files = project.assets.files;
        }
        
        // Generate export
        const exportResult = await this._generateExport(project, files, exportSettings);
        
        // Update project export timestamp
        if (window.DB) {
            project.exports.lastExport = window.Utils ? window.Utils.now() : Date.now();
            project.exports.settings = exportSettings;
            await window.DB.saveProject(project);
        }
        
        if (window.Debugger) {
            window.Debugger.logAction('project.export', {
                projectId,
                fileCount: Object.keys(exportResult.files).length
            });
        }
        
        return exportResult;
    },
    
    /**
     * Generate export files
     * @param {object} project Project object
     * @param {object} files Project files
     * @param {object} settings Export settings
     * @returns {Promise<object>} Export result
     */
    _generateExport: async function(project, files, settings) {
        const exportFiles = {};
        
        // Find entry point (index.html or first HTML file)
        let entryPoint = this._findEntryPoint(files);
        if (!entryPoint) {
            // Generate default index.html
            entryPoint = 'index.html';
            files[entryPoint] = {
                content: this._generateDefaultHTML(project),
                type: 'text'
            };
        }
        
        // Process files
        const processedFiles = {};
        const assetMap = {}; // Maps original paths to export paths
        
        for (const [path, file] of Object.entries(files)) {
            const processed = await this._processFile(path, file, files, settings, assetMap);
            if (processed) {
                processedFiles[path] = processed;
            }
        }
        
        // Generate index.html with proper asset references
        const indexContent = await this._generateIndexHTML(
            project,
            entryPoint,
            processedFiles,
            settings,
            assetMap
        );
        exportFiles['index.html'] = indexContent;
        
        // Copy processed files
        Object.assign(exportFiles, processedFiles);
        
        // Generate manifest.json
        const manifest = this._generateManifest(project, exportFiles, settings);
        exportFiles['manifest.json'] = JSON.stringify(manifest, null, settings.minify ? 0 : 2);
        
        // Generate .gitignore if needed
        if (settings.gitignore !== false) {
            exportFiles['.gitignore'] = this._generateGitignore();
        }
        
        return {
            files: exportFiles,
            manifest,
            entryPoint: 'index.html'
        };
    },
    
    /**
     * Find entry point HTML file
     * @param {object} files
     * @returns {string|null} Entry point path
     */
    _findEntryPoint: function(files) {
        const htmlFiles = Object.keys(files).filter(path => {
            const ext = window.Utils ? window.Utils.getExtension(path) : path.split('.').pop().toLowerCase();
            return ext === 'html';
        });
        
        // Prefer index.html
        if (htmlFiles.includes('index.html')) {
            return 'index.html';
        }
        
        // Return first HTML file
        return htmlFiles.length > 0 ? htmlFiles[0] : null;
    },
    
    /**
     * Process a file for export
     * @param {string} path File path
     * @param {object} file File object
     * @param {object} allFiles All files
     * @param {object} settings Export settings
     * @param {object} assetMap Asset mapping
     * @returns {Promise<object|null>} Processed file
     */
    _processFile: async function(path, file, allFiles, settings, assetMap) {
        const ext = window.Utils ? window.Utils.getExtension(path) : path.split('.').pop().toLowerCase();
        
        // Skip non-text files for now (they'll be handled as assets)
        if (file.type === 'blob' || !file.content) {
            return null;
        }
        
        let content = file.content;
        
        // Process based on file type
        switch (ext) {
            case 'html':
                content = await this._processHTML(content, path, allFiles, settings, assetMap);
                break;
            case 'css':
                content = await this._processCSS(content, path, allFiles, settings, assetMap);
                break;
            case 'js':
                content = await this._processJS(content, path, allFiles, settings, assetMap);
                break;
            default:
                // Copy as-is
                break;
        }
        
        // Minify if requested
        if (settings.minify) {
            content = this._minify(content, ext);
        }
        
        return {
            content,
            type: file.type || 'text'
        };
    },
    
    /**
     * Process HTML content
     * @param {string} html HTML content
     * @param {string} path File path
     * @param {object} allFiles All files
     * @param {object} settings Export settings
     * @param {object} assetMap Asset mapping
     * @returns {Promise<string>} Processed HTML
     */
    _processHTML: async function(html, path, allFiles, settings, assetMap) {
        // Resolve relative paths in HTML
        html = html.replace(/(href|src|action)=(["'])(.*?)\2/gi, (match, attr, quote, url) => {
            if (url.startsWith('http') || url.startsWith('//') || url.startsWith('data:') || url.startsWith('#')) {
                return match; // External URL, keep as-is
            }
            
            // Resolve relative path
            const resolved = window.Utils ? window.Utils.resolvePath(path, url) : url;
            return `${attr}=${quote}${resolved}${quote}`;
        });
        
        // Add CSP meta tag if enabled
        if (settings.cspEnabled) {
            const csp = this._generateCSP(settings);
            if (!html.includes('Content-Security-Policy')) {
                html = html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
            }
        }
        
        return html;
    },
    
    /**
     * Process CSS content
     * @param {string} css CSS content
     * @param {string} path File path
     * @param {object} allFiles All files
     * @param {object} settings Export settings
     * @param {object} assetMap Asset mapping
     * @returns {Promise<string>} Processed CSS
     */
    _processCSS: async function(css, path, allFiles, settings, assetMap) {
        // Resolve relative paths in CSS (url() references)
        css = css.replace(/url\((['"]?)(.*?)\1\)/gi, (match, quote, url) => {
            if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('#')) {
                return match; // External URL, keep as-is
            }
            
            // Resolve relative path
            const resolved = window.Utils ? window.Utils.resolvePath(path, url) : url;
            return `url(${quote}${resolved}${quote})`;
        });
        
        return css;
    },
    
    /**
     * Process JS content
     * @param {string} js JS content
     * @param {string} path File path
     * @param {object} allFiles All files
     * @param {object} settings Export settings
     * @param {object} assetMap Asset mapping
     * @returns {Promise<string>} Processed JS
     */
    _processJS: async function(js, path, allFiles, settings, assetMap) {
        // Basic JS processing (can be extended)
        // For now, just return as-is
        return js;
    },
    
    /**
     * Generate index.html
     * @param {object} project Project
     * @param {string} entryPoint Entry point file
     * @param {object} files Processed files
     * @param {object} settings Export settings
     * @param {object} assetMap Asset mapping
     * @returns {Promise<string>} HTML content
     */
    _generateIndexHTML: async function(project, entryPoint, files, settings, assetMap) {
        const entryFile = files[entryPoint];
        if (!entryFile) {
            return this._generateDefaultHTML(project);
        }
        
        let html = entryFile.content;
        
        // Ensure proper DOCTYPE
        if (!html.includes('<!DOCTYPE')) {
            html = '<!DOCTYPE html>\n' + html;
        }
        
        // Add meta tags
        if (!html.includes('<meta charset')) {
            html = html.replace('<head>', '<head>\n<meta charset="UTF-8">');
        }
        
        if (!html.includes('<meta name="viewport"')) {
            html = html.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">');
        }
        
        // Add title
        if (!html.includes('<title>')) {
            html = html.replace('<head>', `<head>\n<title>${window.Utils ? window.Utils.escapeHtml(project.meta.name) : project.meta.name}</title>`);
        }
        
        return html;
    },
    
    /**
     * Generate default HTML
     * @param {object} project Project
     * @returns {string} HTML content
     */
    _generateDefaultHTML: function(project) {
        const name = window.Utils ? window.Utils.escapeHtml(project.meta.name) : project.meta.name;
        const desc = window.Utils ? window.Utils.escapeHtml(project.meta.description || '') : (project.meta.description || '');
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 40px;
            background: #111;
            color: #fff;
            line-height: 1.6;
        }
        h1 { margin-top: 0; }
    </style>
</head>
<body>
    <h1>${name}</h1>
    ${desc ? `<p>${desc}</p>` : ''}
    <p>Generated by Free Bounce Builder OS</p>
</body>
</html>`;
    },
    
    /**
     * Generate manifest.json
     * @param {object} project Project
     * @param {object} files Export files
     * @param {object} settings Export settings
     * @returns {object} Manifest
     */
    _generateManifest: function(project, files, settings) {
        return {
            name: project.meta.name,
            short_name: project.meta.name.substring(0, 12),
            description: project.meta.description || '',
            version: project.meta.version,
            manifest_version: 2,
            start_url: '/index.html',
            display: 'standalone',
            theme_color: '#000000',
            background_color: '#111111',
            generated: window.Utils ? window.Utils.toISO(window.Utils.now()) : new Date().toISOString(),
            files: Object.keys(files).sort()
        };
    },
    
    /**
     * Generate CSP header
     * @param {object} settings Export settings
     * @returns {string} CSP string
     */
    _generateCSP: function(settings) {
        const policies = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data: https:",
            "connect-src 'self'"
        ];
        
        if (settings.cdnAllowed) {
            policies.push("script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com");
            policies.push("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
            policies.push("font-src 'self' data: https://fonts.gstatic.com");
        }
        
        return policies.join('; ');
    },
    
    /**
     * Generate .gitignore
     * @returns {string} Gitignore content
     */
    _generateGitignore: function() {
        return `# Dependencies
node_modules/

# Build outputs
dist/
build/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
*.log
`;
    },
    
    /**
     * Minify content
     * @param {string} content Content to minify
     * @param {string} type Content type
     * @returns {string} Minified content
     */
    _minify: function(content, type) {
        // Basic minification (can be enhanced)
        if (type === 'html') {
            return content
                .replace(/\s+/g, ' ')
                .replace(/>\s+</g, '><')
                .trim();
        } else if (type === 'css') {
            return content
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
                .replace(/\s+/g, ' ')
                .replace(/;\s*}/g, '}')
                .replace(/\s*{\s*/g, '{')
                .replace(/\s*}\s*/g, '}')
                .trim();
        } else if (type === 'js') {
            return content
                .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
                .replace(/\/\/.*$/gm, '') // Remove line comments
                .replace(/\s+/g, ' ')
                .trim();
        }
        return content;
    },
    
    /**
     * Download export as ZIP
     * @param {object} exportResult Export result
     * @param {string} filename Filename (without .zip)
     * @returns {Promise}
     */
    downloadZip: async function(exportResult, filename = 'export') {
        if (!window.JSZip) {
            throw new Error('JSZip library not available');
        }
        
        const zip = new JSZip();
        
        // Add all files to ZIP
        for (const [path, file] of Object.entries(exportResult.files)) {
            zip.file(path, file.content || file);
        }
        
        // Generate ZIP blob
        const blob = await zip.generateAsync({ type: 'blob' });
        
        // Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Cleanup
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        if (window.Debugger) {
            window.Debugger.logAction('export.download', { filename, fileCount: Object.keys(exportResult.files).length });
        }
    },
    
    /**
     * Export to individual files (for file system)
     * @param {object} exportResult Export result
     * @returns {object} Files object ready for file system write
     */
    prepareFiles: function(exportResult) {
        const prepared = {};
        
        for (const [path, file] of Object.entries(exportResult.files)) {
            prepared[path] = typeof file === 'string' ? file : file.content;
        }
        
        return prepared;
    }
};

