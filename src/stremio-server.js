// WebSocket server for Stremio addon integration
// This creates a secure tunnel between HyperStreamrr and the Stremio addon

import { WebSocketServer } from 'ws';
import crypto from 'crypto';

export class StremioServer {
    constructor(hyperShare, port = 8080) {
        this.hyperShare = hyperShare;
        this.port = port;
        this.wss = null;
        this.clients = new Set();
        this.secretKey = crypto.randomBytes(32).toString('hex');
        console.log('StremioServer secret key:', this.secretKey);
    }

    start() {
        this.wss = new WebSocketServer({ port: this.port });
        
        this.wss.on('connection', (ws, req) => {
            console.log('Stremio addon connected from:', req.socket.remoteAddress);
            this.clients.add(ws);
            
            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data);
                    await this.handleMessage(ws, message);
                } catch (error) {
                    console.error('Error handling message:', error);
                    this.sendError(ws, 'Invalid message format');
                }
            });
            
            ws.on('close', () => {
                console.log('Stremio addon disconnected');
                this.clients.delete(ws);
            });
            
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.clients.delete(ws);
            });
            
            // Send initial welcome message
            this.sendMessage(ws, {
                method: 'welcome',
                data: {
                    version: '1.0.0',
                    features: ['networks', 'drives', 'files', 'streaming']
                }
            });
        });
        
        console.log(`StremioServer listening on port ${this.port}`);
    }

    stop() {
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
        this.clients.clear();
    }

    sendMessage(ws, message) {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    sendError(ws, error, id = null) {
        this.sendMessage(ws, {
            id,
            error: error.message || error
        });
    }

    sendResponse(ws, id, result) {
        this.sendMessage(ws, {
            id,
            result
        });
    }

    broadcast(message) {
        this.clients.forEach(ws => {
            this.sendMessage(ws, message);
        });
    }

    async handleMessage(ws, message) {
        const { id, method, params = {} } = message;
        
        try {
            switch (method) {
                case 'getNetworks':
                    await this.handleGetNetworks(ws, id);
                    break;
                    
                case 'getDrives':
                    await this.handleGetDrives(ws, id, params);
                    break;
                    
                case 'getFiles':
                    await this.handleGetFiles(ws, id, params);
                    break;
                    
                case 'getStreamUrl':
                    await this.handleGetStreamUrl(ws, id, params);
                    break;
                    
                case 'searchFiles':
                    await this.handleSearchFiles(ws, id, params);
                    break;
                    
                case 'getStats':
                    await this.handleGetStats(ws, id);
                    break;
                    
                default:
                    throw new Error(`Unknown method: ${method}`);
            }
        } catch (error) {
            console.error('Error handling method:', method, error);
            this.sendError(ws, error, id);
        }
    }

    async handleGetNetworks(ws, id) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const networks = Array.from(this.hyperShare.networks.values()).map(network => ({
            key: network.key,
            name: network.name,
            description: network.description,
            role: network.role,
            created: network.created,
            peers: network.swarm.connections.size
        }));
        
        this.sendResponse(ws, id, networks);
    }

    async handleGetDrives(ws, id, params) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const { networkKey } = params;
        
        if (networkKey && !this.hyperShare.networks.has(networkKey)) {
            throw new Error('Network not found');
        }
        
        // If networkKey is provided, switch to that network
        if (networkKey) {
            const network = this.hyperShare.networks.get(networkKey);
            this.hyperShare.activeNetwork = network;
        }
        
        const drives = await this.hyperShare.browseDrives();
        
        const formattedDrives = drives.map(drive => ({
            key: drive.key,
            name: drive.name,
            description: drive.description,
            owner: drive.owner,
            stats: drive.stats,
            tags: drive.tags,
            verified: drive.verified,
            connectionStats: drive.connectionStats
        }));
        
        this.sendResponse(ws, id, formattedDrives);
    }

    async handleGetFiles(ws, id, params) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const { driveKey, path = '/' } = params;
        
        if (!driveKey) {
            throw new Error('driveKey is required');
        }
        
        const files = await this.hyperShare.browseFiles(driveKey, path);
        
        const formattedFiles = files.map(file => ({
            path: file.path,
            name: file.name,
            size: file.size,
            isDirectory: file.isDirectory,
            mtime: file.mtime,
            driveKey: driveKey
        }));
        
        this.sendResponse(ws, id, formattedFiles);
    }

    async handleGetStreamUrl(ws, id, params) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const { driveKey, filePath } = params;
        
        if (!driveKey || !filePath) {
            throw new Error('driveKey and filePath are required');
        }
        
        // Create a temporary HTTP server endpoint for streaming
        const streamId = crypto.randomBytes(16).toString('hex');
        const streamUrl = `http://localhost:${this.port + 1000}/stream/${streamId}`;
        
        // Store stream info for later retrieval
        this.storeStreamInfo(streamId, driveKey, filePath);
        
        this.sendResponse(ws, id, streamUrl);
    }

    async handleSearchFiles(ws, id, params) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const { query, filters = {} } = params;
        
        if (!query) {
            throw new Error('query is required');
        }
        
        const results = await this.hyperShare.searchFiles(query, filters);
        
        const formattedResults = results.map(file => ({
            path: file.path,
            name: file.name,
            size: file.size,
            driveKey: file.driveKey,
            networkKey: file.networkKey
        }));
        
        this.sendResponse(ws, id, formattedResults);
    }

    async handleGetStats(ws, id) {
        if (!this.hyperShare.ready) {
            throw new Error('HyperShare not ready');
        }
        
        const stats = await this.hyperShare.getDetailedNetworkStats();
        this.sendResponse(ws, id, stats);
    }

    // Stream info storage for HTTP streaming
    storeStreamInfo(streamId, driveKey, filePath) {
        // This would be implemented to store stream info
        // for the HTTP streaming server
        console.log('Stream info stored:', { streamId, driveKey, filePath });
    }

    // Notify connected clients of network changes
    notifyNetworkUpdate() {
        this.broadcast({
            method: 'networksUpdated',
            data: Array.from(this.hyperShare.networks.values()).map(network => ({
                key: network.key,
                name: network.name,
                peers: network.swarm.connections.size
            }))
        });
    }

    notifyDriveUpdate() {
        this.broadcast({
            method: 'drivesUpdated',
            data: { updated: Date.now() }
        });
    }
}

// HTTP streaming server for serving files to Stremio
export class StreamingServer {
    constructor(hyperShare, port = 9080) {
        this.hyperShare = hyperShare;
        this.port = port;
        this.server = null;
        this.streamCache = new Map();
    }

    start() {
        const express = require('express');
        const app = express();
        
        // CORS headers for Stremio
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Range, Content-Range, Content-Length, Content-Type');
            next();
        });
        
        app.get('/stream/:streamId', async (req, res) => {
            try {
                const { streamId } = req.params;
                const streamInfo = this.streamCache.get(streamId);
                
                if (!streamInfo) {
                    return res.status(404).json({ error: 'Stream not found' });
                }
                
                const { driveKey, filePath } = streamInfo;
                
                // Get file info
                const drive = await this.hyperShare.getDrive(driveKey);
                const stat = await drive.stat(filePath);
                
                if (!stat) {
                    return res.status(404).json({ error: 'File not found' });
                }
                
                const fileSize = stat.size;
                const range = req.headers.range;
                
                if (range) {
                    // Handle range requests for seeking
                    const parts = range.replace(/bytes=/, '').split('-');
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                    const chunksize = (end - start) + 1;
                    
                    res.writeHead(206, {
                        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunksize,
                        'Content-Type': 'video/mp4'
                    });
                    
                    const stream = drive.createReadStream(filePath, { start, end });
                    stream.pipe(res);
                } else {
                    // Full file stream
                    res.writeHead(200, {
                        'Content-Length': fileSize,
                        'Content-Type': 'video/mp4'
                    });
                    
                    const stream = drive.createReadStream(filePath);
                    stream.pipe(res);
                }
                
            } catch (error) {
                console.error('Streaming error:', error);
                res.status(500).json({ error: 'Streaming failed' });
            }
        });
        
        this.server = app.listen(this.port, () => {
            console.log(`StreamingServer listening on port ${this.port}`);
        });
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        this.streamCache.clear();
    }

    addStream(streamId, driveKey, filePath) {
        this.streamCache.set(streamId, { driveKey, filePath });
        
        // Auto-expire after 1 hour
        setTimeout(() => {
            this.streamCache.delete(streamId);
        }, 3600000);
    }
}