// Enhanced HyperStreamrr connection manager for cross-network connectivity

const WebSocket = require('ws');
const crypto = require('crypto');

class RemoteHyperStreamrrConnector {
    constructor(config = {}) {
        this.connections = new Map();
        this.config = {
            reconnectAttempts: 5,
            reconnectDelay: 2000,
            heartbeatInterval: 30000,
            requestTimeout: 15000,
            ...config
        };
        this.messageId = 0;
        this.pendingRequests = new Map();
    }

    // Add a HyperStreamrr instance to connect to
    addInstance(instanceId, connectionInfo) {
        const instance = {
            id: instanceId,
            ...connectionInfo,
            ws: null,
            connected: false,
            authenticated: false,
            reconnectAttempts: 0,
            lastHeartbeat: null,
            networks: [],
            drives: []
        };

        this.connections.set(instanceId, instance);
        console.log(`📝 Added HyperStreamrr instance: ${instanceId}`);
        
        return instanceId;
    }

    // Connect to a specific instance
    async connect(instanceId) {
        const instance = this.connections.get(instanceId);
        if (!instance) {
            throw new Error(`Instance ${instanceId} not found`);
        }

        return new Promise((resolve, reject) => {
            const wsUrl = this.buildWebSocketUrl(instance);
            console.log(`🔌 Connecting to ${instanceId} at ${wsUrl}`);
            
            const ws = new WebSocket(wsUrl, {
                headers: instance.headers || {},
                rejectUnauthorized: instance.allowSelfSigned === false
            });

            ws.on('open', () => {
                console.log(`✅ Connected to ${instanceId}`);
                instance.ws = ws;
                instance.connected = true;
                instance.reconnectAttempts = 0;
                this.setupHeartbeat(instanceId);
                resolve(instanceId);
            });

            ws.on('message', (data) => {
                this.handleMessage(instanceId, data);
            });

            ws.on('error', (error) => {
                console.error(`❌ Connection error for ${instanceId}:`, error.message);
                instance.connected = false;
                instance.authenticated = false;
                
                if (instance.reconnectAttempts < this.config.reconnectAttempts) {
                    setTimeout(() => this.reconnect(instanceId), this.config.reconnectDelay);
                } else {
                    reject(new Error(`Failed to connect to ${instanceId}: ${error.message}`));
                }
            });

            ws.on('close', (code, reason) => {
                console.log(`🔌 Disconnected from ${instanceId}: ${code} ${reason}`);
                instance.connected = false;
                instance.authenticated = false;
                
                if (instance.reconnectAttempts < this.config.reconnectAttempts) {
                    setTimeout(() => this.reconnect(instanceId), this.config.reconnectDelay);
                }
            });
        });
    }

    // Connect to all configured instances
    async connectAll() {
        const connections = [];
        for (const instanceId of this.connections.keys()) {
            connections.push(this.connect(instanceId).catch(error => {
                console.error(`Failed to connect to ${instanceId}:`, error.message);
                return null;
            }));
        }
        
        const results = await Promise.allSettled(connections);
        const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
        console.log(`🌐 Connected to ${successful}/${this.connections.size} instances`);
        
        return successful;
    }

    async reconnect(instanceId) {
        const instance = this.connections.get(instanceId);
        if (!instance) return;

        instance.reconnectAttempts++;
        console.log(`🔄 Reconnecting to ${instanceId} (attempt ${instance.reconnectAttempts}/${this.config.reconnectAttempts})`);
        
        try {
            await this.connect(instanceId);
            if (instance.authenticated) {
                await this.authenticate(instanceId);
            }
        } catch (error) {
            console.error(`Reconnection failed for ${instanceId}:`, error.message);
        }
    }

    buildWebSocketUrl(instance) {
        const protocol = instance.secure ? 'wss' : 'ws';
        const port = instance.port ? `:${instance.port}` : '';
        return `${protocol}://${instance.host}${port}`;
    }

    setupHeartbeat(instanceId) {
        const instance = this.connections.get(instanceId);
        if (!instance) return;

        const heartbeat = setInterval(() => {
            if (!instance.connected) {
                clearInterval(heartbeat);
                return;
            }

            this.sendMessage(instanceId, {
                method: 'ping',
                timestamp: Date.now()
            });
        }, this.config.heartbeatInterval);

        instance.heartbeatInterval = heartbeat;
    }

    handleMessage(instanceId, data) {
        try {
            const message = JSON.parse(data);
            const instance = this.connections.get(instanceId);
            
            if (message.type === 'auth_required') {
                this.handleAuthChallenge(instanceId, message);
            } else if (message.method === 'pong') {
                instance.lastHeartbeat = Date.now();
            } else if (message.id && this.pendingRequests.has(message.id)) {
                const { resolve, reject } = this.pendingRequests.get(message.id);
                this.pendingRequests.delete(message.id);
                
                if (message.error) {
                    reject(new Error(message.error));
                } else {
                    resolve(message.result);
                }
            } else if (message.method === 'networksUpdated') {
                instance.networks = message.data;
            } else if (message.method === 'drivesUpdated') {
                // Refresh drives for this instance
                this.refreshInstanceData(instanceId);
            }
        } catch (error) {
            console.error(`Error parsing message from ${instanceId}:`, error);
        }
    }

    async handleAuthChallenge(instanceId, message) {
        const instance = this.connections.get(instanceId);
        if (!instance.authKey) {
            console.error(`❌ No auth key configured for ${instanceId}`);
            return;
        }

        try {
            await this.authenticate(instanceId);
            console.log(`🔐 Authenticated with ${instanceId}`);
        } catch (error) {
            console.error(`❌ Authentication failed for ${instanceId}:`, error.message);
            instance.ws.close();
        }
    }

    async authenticate(instanceId) {
        const instance = this.connections.get(instanceId);
        
        const response = await this.sendRequest(instanceId, {
            method: 'authenticate',
            params: {
                authKey: instance.authKey,
                clientInfo: {
                    type: 'stremio-addon',
                    version: '1.0.0',
                    userAgent: 'HyperStreamrr Stremio Addon'
                }
            }
        });

        instance.authenticated = true;
        return response;
    }

    async sendRequest(instanceId, request) {
        const instance = this.connections.get(instanceId);
        if (!instance || !instance.connected) {
            throw new Error(`Instance ${instanceId} not connected`);
        }

        const id = ++this.messageId;
        const message = { id, ...request };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            
            instance.ws.send(JSON.stringify(message));
            
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, this.config.requestTimeout);
        });
    }

    sendMessage(instanceId, message) {
        const instance = this.connections.get(instanceId);
        if (instance && instance.connected) {
            instance.ws.send(JSON.stringify(message));
        }
    }

    // High-level API methods

    async getAllNetworks() {
        const allNetworks = [];
        
        for (const [instanceId, instance] of this.connections.entries()) {
            if (!instance.connected || !instance.authenticated) continue;
            
            try {
                const networks = await this.sendRequest(instanceId, {
                    method: 'getNetworks'
                });
                
                // Add instance info to each network
                const networksWithInstance = networks.map(network => ({
                    ...network,
                    instanceId,
                    instanceName: instance.name || instanceId
                }));
                
                allNetworks.push(...networksWithInstance);
            } catch (error) {
                console.error(`Failed to get networks from ${instanceId}:`, error.message);
            }
        }
        
        return allNetworks;
    }

    async getAllDrives(networkKey = null) {
        const allDrives = [];
        
        for (const [instanceId, instance] of this.connections.entries()) {
            if (!instance.connected || !instance.authenticated) continue;
            
            try {
                const drives = await this.sendRequest(instanceId, {
                    method: 'getDrives',
                    params: { networkKey }
                });
                
                const drivesWithInstance = drives.map(drive => ({
                    ...drive,
                    instanceId,
                    instanceName: instance.name || instanceId
                }));
                
                allDrives.push(...drivesWithInstance);
            } catch (error) {
                console.error(`Failed to get drives from ${instanceId}:`, error.message);
            }
        }
        
        return allDrives;
    }

    async getAllFiles(driveKey, path = '/') {
        // Find which instance has this drive
        for (const [instanceId, instance] of this.connections.entries()) {
            if (!instance.connected || !instance.authenticated) continue;
            
            try {
                const files = await this.sendRequest(instanceId, {
                    method: 'getFiles',
                    params: { driveKey, path }
                });
                
                return files.map(file => ({
                    ...file,
                    instanceId,
                    instanceName: instance.name || instanceId
                }));
            } catch (error) {
                // Try next instance
                continue;
            }
        }
        
        throw new Error(`Drive ${driveKey} not found in any connected instance`);
    }

    async searchAllFiles(query, filters = {}) {
        const allResults = [];
        
        for (const [instanceId, instance] of this.connections.entries()) {
            if (!instance.connected || !instance.authenticated) continue;
            
            try {
                const results = await this.sendRequest(instanceId, {
                    method: 'searchFiles',
                    params: { query, filters }
                });
                
                const resultsWithInstance = results.map(file => ({
                    ...file,
                    instanceId,
                    instanceName: instance.name || instanceId
                }));
                
                allResults.push(...resultsWithInstance);
            } catch (error) {
                console.error(`Search failed on ${instanceId}:`, error.message);
            }
        }
        
        return allResults;
    }

    async getStreamUrl(instanceId, driveKey, filePath) {
        const instance = this.connections.get(instanceId);
        if (!instance || !instance.connected || !instance.authenticated) {
            throw new Error(`Instance ${instanceId} not available`);
        }

        return await this.sendRequest(instanceId, {
            method: 'getStreamUrl',
            params: { driveKey, filePath }
        });
    }

    async refreshInstanceData(instanceId) {
        const instance = this.connections.get(instanceId);
        if (!instance || !instance.connected || !instance.authenticated) return;

        try {
            instance.networks = await this.sendRequest(instanceId, {
                method: 'getNetworks'
            });
        } catch (error) {
            console.error(`Failed to refresh data for ${instanceId}:`, error.message);
        }
    }

    getConnectedInstances() {
        return Array.from(this.connections.values())
            .filter(instance => instance.connected && instance.authenticated)
            .map(instance => ({
                id: instance.id,
                name: instance.name || instance.id,
                host: instance.host,
                networks: instance.networks.length,
                lastHeartbeat: instance.lastHeartbeat
            }));
    }

    disconnect(instanceId) {
        const instance = this.connections.get(instanceId);
        if (instance) {
            if (instance.ws) {
                instance.ws.close();
            }
            if (instance.heartbeatInterval) {
                clearInterval(instance.heartbeatInterval);
            }
            instance.connected = false;
            instance.authenticated = false;
        }
    }

    disconnectAll() {
        for (const instanceId of this.connections.keys()) {
            this.disconnect(instanceId);
        }
        this.pendingRequests.clear();
    }
}

module.exports = RemoteHyperStreamrrConnector;