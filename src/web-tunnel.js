// Web-based tunnel server for cross-network connectivity
// Uses browser-compatible APIs for Pear Desktop environment

import crypto from 'hypercore-crypto';
import b4a from 'b4a';

export class WebTunnelServer {
    constructor(hyperShare, options = {}) {
        this.hyperShare = hyperShare;
        this.port = options.port || 8080;
        this.enableRemoteAccess = options.enableRemoteAccess || false;
        this.authKey = options.authKey || this.generateAuthKey();
        this.maxConnections = options.maxConnections || 10;
        
        this.clients = new Map();
        this.streamCache = new Map();
        this.isRunning = false;
        
        console.log('🔐 Web Tunnel Auth Key:', this.authKey);
        console.log('🌐 Remote access:', this.enableRemoteAccess ? 'ENABLED' : 'DISABLED');
    }

    generateAuthKey() {
        return b4a.toString(crypto.randomBytes(32), 'hex');
    }

    start() {
        // In Pear environment, we'll use a different approach
        // Instead of WebSocket server, we'll create connection info for manual setup
        this.isRunning = true;
        
        console.log('🚀 Web Tunnel server initialized');
        console.log('📋 Connection Information:');
        console.log('   Type: Manual Configuration Required');
        console.log('   Auth Key:', this.authKey);
        
        if (this.enableRemoteAccess) {
            console.log('⚠️  For remote access, configure your network manually:');
            console.log('   1. Set up port forwarding for port', this.port);
            console.log('   2. Configure firewall rules');
            console.log('   3. Share connection details securely');
        }
        
        // Create connection info object for external access
        this.createConnectionInfo();
        
        // Set up periodic stats broadcasting
        this.setupStatsInterval();
    }

    createConnectionInfo() {
        const connectionInfo = {
            authKey: this.authKey,
            version: '1.0.0',
            capabilities: ['networks', 'drives', 'files', 'streaming', 'search'],
            timestamp: Date.now()
        };
        
        // Store connection info where it can be accessed
        if (typeof window !== 'undefined') {
            window.hyperStreamrrConnectionInfo = connectionInfo;
            
            // Dispatch event for any listeners
            window.dispatchEvent(new CustomEvent('hyperstreamrr-tunnel-ready', {
                detail: connectionInfo
            }));
        }
        
        return connectionInfo;
    }

    setupStatsInterval() {
        setInterval(() => {
            if (this.isRunning && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('hyperstreamrr-stats-update', {
                    detail: this.getStats()
                }));
            }
        }, 5000);
    }

    getStats() {
        if (!this.hyperShare.ready) return null;
        
        return {
            networks: this.hyperShare.networks.size,
            activeNetwork: this.hyperShare.activeNetwork?.name,
            peers: this.hyperShare.activeNetwork?.swarm?.connections?.size || 0,
            drives: this.hyperShare.drivesListCache?.length || 0,
            timestamp: Date.now()
        };
    }

    // API methods that can be called directly
    async handleRequest(method, params = {}) {
        if (!this.isRunning) {
            throw new Error('Tunnel server not running');
        }

        switch (method) {
            case 'getNetworks':
                return this.handleGetNetworks();
            case 'getDrives':
                return this.handleGetDrives(params);
            case 'getFiles':
                return this.handleGetFiles(params);
            case 'getStreamUrl':
                return this.handleGetStreamUrl(params);
            case 'searchFiles':
                return this.handleSearchFiles(params);
            case 'getStats':
                return this.handleGetStats();
            default:
                throw new Error(`Unknown method: ${method}`);
        }
    }

    async handleGetNetworks() {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        return Array.from(this.hyperShare.networks.values()).map(network => ({
            key: network.key,
            name: network.name,
            description: network.description,
            role: network.role,
            created: network.created,
            peers: network.swarm.connections.size
        }));
    }

    async handleGetDrives(params) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const { networkKey } = params;
        
        if (networkKey && !this.hyperShare.networks.has(networkKey)) {
            throw new Error('Network not found');
        }
        
        if (networkKey) {
            const network = this.hyperShare.networks.get(networkKey);
            this.hyperShare.activeNetwork = network;
        }
        
        const drives = await this.hyperShare.browseDrives();
        
        return drives.map(drive => ({
            key: drive.key,
            name: drive.name,
            description: drive.description,
            owner: drive.owner,
            stats: drive.stats,
            tags: drive.tags,
            verified: drive.verified,
            connectionStats: drive.connectionStats
        }));
    }

    async handleGetFiles(params) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const { driveKey, path = '/' } = params;
        
        if (!driveKey) {
            throw new Error('driveKey is required');
        }
        
        const files = await this.hyperShare.browseFiles(driveKey, path);
        
        return files.map(file => ({
            path: file.path,
            name: file.name,
            size: file.size,
            isDirectory: file.isDirectory,
            mtime: file.mtime,
            driveKey: driveKey
        }));
    }

    async handleGetStreamUrl(params) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const { driveKey, filePath } = params;
        
        if (!driveKey || !filePath) {
            throw new Error('driveKey and filePath are required');
        }
        
        // For web environment, we'll create a blob URL for local streaming
        try {
            const fileContent = await this.hyperShare.downloadFile(driveKey, filePath);
            const blob = new Blob([fileContent], { type: this.getContentType(filePath) });
            const streamUrl = URL.createObjectURL(blob);
            
            // Store for cleanup later
            const streamId = crypto.randomBytes(16).toString('hex');
            this.streamCache.set(streamId, {
                driveKey,
                filePath,
                blobUrl: streamUrl,
                createdAt: Date.now()
            });
            
            // Auto-cleanup after 1 hour
            setTimeout(() => {
                const streamInfo = this.streamCache.get(streamId);
                if (streamInfo) {
                    URL.revokeObjectURL(streamInfo.blobUrl);
                    this.streamCache.delete(streamId);
                }
            }, 3600000);
            
            return {
                streamUrl,
                streamId,
                expiresIn: 3600000
            };
            
        } catch (error) {
            console.error('Stream URL generation error:', error);
            throw new Error('Failed to generate stream URL');
        }
    }

    async handleSearchFiles(params) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const { query, filters = {} } = params;
        
        if (!query) {
            throw new Error('query is required');
        }
        
        const results = await this.hyperShare.searchFiles(query, filters);
        
        return results.map(file => ({
            path: file.path,
            name: file.name,
            size: file.size,
            driveKey: file.driveKey,
            networkKey: file.networkKey
        }));
    }

    async handleGetStats() {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        return await this.hyperShare.getDetailedNetworkStats();
    }

    getContentType(filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase();
        const types = {
            'mp4': 'video/mp4',
            'mkv': 'video/x-matroska',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'webm': 'video/webm',
            'm4v': 'video/x-m4v'
        };
        return types[ext] || 'video/mp4';
    }

    stop() {
        this.isRunning = false;
        
        // Cleanup blob URLs
        for (const streamInfo of this.streamCache.values()) {
            if (streamInfo.blobUrl) {
                URL.revokeObjectURL(streamInfo.blobUrl);
            }
        }
        
        this.streamCache.clear();
        this.clients.clear();
        
        console.log('🛑 Web Tunnel server stopped');
    }

    // Method to export connection configuration for manual setup
    exportConnectionConfig() {
        return {
            type: 'hyperstreamrr-connection',
            version: '1.0.0',
            authKey: this.authKey,
            instructions: {
                setup: [
                    'Install HyperStreamrr Stremio addon',
                    'Configure connection with provided auth key',
                    'Ensure network connectivity between devices'
                ],
                environments: {
                    local: {
                        host: 'localhost',
                        port: this.port,
                        secure: false
                    },
                    remote: {
                        host: 'YOUR_PUBLIC_IP_OR_DOMAIN',
                        port: this.port,
                        secure: false,
                        notes: 'Configure port forwarding and firewall'
                    }
                }
            },
            capabilities: ['networks', 'drives', 'files', 'streaming', 'search'],
            timestamp: Date.now()
        };
    }
}