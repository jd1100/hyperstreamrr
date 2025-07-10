// Stremio HyperStreamrr Addon
// This addon connects to a local HyperStreamrr instance and provides content discovery

const { addonBuilder } = require('stremio-addon-sdk');
const express = require('express');
const cors = require('cors');
const RemoteHyperStreamrrConnector = require('./remote-connector');

// Addon configuration
const manifest = {
    id: 'org.hyperstreamrr.stremio',
    version: '1.0.0',
    name: 'HyperStreamrr',
    description: 'Access your HyperStreamrr P2P networks from Stremio',
    icon: 'https://via.placeholder.com/256x256/00ff88/ffffff?text=HR',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'hyperstreamrr-movies',
            name: 'HyperStreamrr Movies',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'genre', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        },
        {
            type: 'series',
            id: 'hyperstreamrr-series',
            name: 'HyperStreamrr Series',
            extra: [
                { name: 'search', isRequired: false },
                { name: 'genre', isRequired: false },
                { name: 'skip', isRequired: false }
            ]
        }
    ]
};

// Initialize connection manager
const connector = new RemoteHyperStreamrrConnector({
    reconnectAttempts: 5,
    reconnectDelay: 2000,
    heartbeatInterval: 30000,
    requestTimeout: 15000
});

// Load configuration from environment or config file
function loadConfiguration() {
    const instances = [];
    
    // Primary local instance
    if (process.env.HYPERSTREAMRR_LOCAL_HOST || !process.env.HYPERSTREAMRR_INSTANCES) {
        instances.push({
            id: 'local',
            name: 'Local HyperStreamrr',
            host: process.env.HYPERSTREAMRR_LOCAL_HOST || 'localhost',
            port: parseInt(process.env.HYPERSTREAMRR_LOCAL_PORT) || 8080,
            authKey: process.env.HYPERSTREAMRR_LOCAL_AUTH_KEY,
            secure: false
        });
    }
    
    // Remote instances from environment
    if (process.env.HYPERSTREAMRR_INSTANCES) {
        try {
            const remoteInstances = JSON.parse(process.env.HYPERSTREAMRR_INSTANCES);
            instances.push(...remoteInstances);
        } catch (error) {
            console.error('❌ Failed to parse HYPERSTREAMRR_INSTANCES:', error.message);
        }
    }
    
    return instances;
}

// Initialize connections
async function initializeConnections() {
    const instances = loadConfiguration();
    
    console.log(`🔧 Configuring ${instances.length} HyperStreamrr instances:`);
    
    for (const instance of instances) {
        console.log(`  📡 ${instance.name} (${instance.host}:${instance.port})`);
        connector.addInstance(instance.id, instance);
    }
    
    const connected = await connector.connectAll();
    console.log(`🌐 Successfully connected to ${connected}/${instances.length} instances`);
    
    return connected > 0;
}

// Create addon
const builder = new addonBuilder(manifest);

// Utility functions
function isVideoFile(filename) {
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v'];
    return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function extractMetadata(filename) {
    // Simple metadata extraction from filename
    const name = filename.replace(/\.[^/.]+$/, ''); // Remove extension
    const year = name.match(/\\((\\d{4})\\)/)?.[1] || name.match(/(\\d{4})/)?.[1];
    const cleanName = name.replace(/\\(\\d{4}\\)/, '').replace(/\\./g, ' ').trim();
    
    return {
        name: cleanName,
        year: year ? parseInt(year) : null,
        originalName: filename
    };
}

function createImdbId(name, year) {
    // Create a pseudo-IMDB ID from name and year
    const hash = require('crypto').createHash('md5').update(`${name}${year || ''}`).digest('hex');
    return `tt${hash.substring(0, 7)}`;
}

function categorizeContent(files) {
    const movies = [];
    const series = [];
    
    files.forEach(file => {
        if (!isVideoFile(file.name)) return;
        
        const metadata = extractMetadata(file.name);
        const imdbId = createImdbId(metadata.name, metadata.year);
        
        // Simple heuristic: if filename contains season/episode patterns, it's a series
        const isSeriesPattern = /S\\d+E\\d+|Season\\s+\\d+|Episode\\s+\\d+/i.test(file.name);
        
        if (isSeriesPattern) {
            series.push({
                id: imdbId,
                type: 'series',
                name: metadata.name,
                year: metadata.year,
                poster: 'https://via.placeholder.com/300x450/333333/ffffff?text=Series',
                background: 'https://via.placeholder.com/1920x1080/333333/ffffff?text=Series',
                description: `Available on HyperStreamrr: ${metadata.originalName}`,
                driveKey: file.driveKey,
                filePath: file.path,
                filename: file.name
            });
        } else {
            movies.push({
                id: imdbId,
                type: 'movie',
                name: metadata.name,
                year: metadata.year,
                poster: 'https://via.placeholder.com/300x450/333333/ffffff?text=Movie',
                background: 'https://via.placeholder.com/1920x1080/333333/ffffff?text=Movie',
                description: `Available on HyperStreamrr: ${metadata.originalName}`,
                driveKey: file.driveKey,
                filePath: file.path,
                filename: file.name
            });
        }
    });
    
    return { movies, series };
}

// Catalog handler
builder.defineCatalogHandler(async (args) => {
    try {
        if (!hyperStreamrr.connected) {
            await hyperStreamrr.connect();
        }
        
        const { type, id, extra = {} } = args;
        const { search, skip = 0 } = extra;
        
        let allFiles = [];
        
        if (search) {
            // Search across all networks
            const networks = await hyperStreamrr.getNetworks();
            for (const network of networks) {
                const searchResults = await hyperStreamrr.searchFiles(search, {});
                allFiles = allFiles.concat(searchResults.map(file => ({
                    ...file,
                    networkKey: network.key
                })));
            }
        } else {
            // Get all files from all drives
            const networks = await hyperStreamrr.getNetworks();
            for (const network of networks) {
                const drives = await hyperStreamrr.getDrives(network.key);
                for (const drive of drives) {
                    const files = await hyperStreamrr.getFiles(drive.key);
                    allFiles = allFiles.concat(files.map(file => ({
                        ...file,
                        driveKey: drive.key,
                        networkKey: network.key
                    })));
                }
            }
        }
        
        const { movies, series } = categorizeContent(allFiles);
        const content = type === 'movie' ? movies : series;
        
        return {
            metas: content.slice(skip, skip + 100) // Pagination
        };
    } catch (error) {
        console.error('Catalog error:', error);
        return { metas: [] };
    }
});

// Meta handler
builder.defineMetaHandler(async (args) => {
    try {
        if (!hyperStreamrr.connected) {
            await hyperStreamrr.connect();
        }
        
        const { type, id } = args;
        
        // Find the content by ID
        const networks = await hyperStreamrr.getNetworks();
        let foundContent = null;
        
        for (const network of networks) {
            const drives = await hyperStreamrr.getDrives(network.key);
            for (const drive of drives) {
                const files = await hyperStreamrr.getFiles(drive.key);
                const { movies, series } = categorizeContent(files.map(file => ({
                    ...file,
                    driveKey: drive.key,
                    networkKey: network.key
                })));
                
                const content = type === 'movie' ? movies : series;
                foundContent = content.find(item => item.id === id);
                
                if (foundContent) break;
            }
            if (foundContent) break;
        }
        
        if (!foundContent) {
            throw new Error('Content not found');
        }
        
        return {
            meta: {
                id: foundContent.id,
                type: foundContent.type,
                name: foundContent.name,
                year: foundContent.year,
                poster: foundContent.poster,
                background: foundContent.background,
                description: foundContent.description,
                genres: ['P2P', 'HyperStreamrr'],
                director: ['Unknown'],
                cast: ['Unknown']
            }
        };
    } catch (error) {
        console.error('Meta error:', error);
        throw error;
    }
});

// Stream handler
builder.defineStreamHandler(async (args) => {
    try {
        if (!hyperStreamrr.connected) {
            await hyperStreamrr.connect();
        }
        
        const { type, id } = args;
        
        // Find the content by ID
        const networks = await hyperStreamrr.getNetworks();
        let foundContent = null;
        
        for (const network of networks) {
            const drives = await hyperStreamrr.getDrives(network.key);
            for (const drive of drives) {
                const files = await hyperStreamrr.getFiles(drive.key);
                const { movies, series } = categorizeContent(files.map(file => ({
                    ...file,
                    driveKey: drive.key,
                    networkKey: network.key
                })));
                
                const content = type === 'movie' ? movies : series;
                foundContent = content.find(item => item.id === id);
                
                if (foundContent) break;
            }
            if (foundContent) break;
        }
        
        if (!foundContent) {
            throw new Error('Content not found');
        }
        
        // Get stream URL from HyperStreamrr
        const streamUrl = await hyperStreamrr.getStreamUrl(foundContent.driveKey, foundContent.filePath);
        
        return {
            streams: [
                {
                    name: 'HyperStreamrr',
                    description: `Stream from ${foundContent.filename}`,
                    url: streamUrl,
                    title: foundContent.name,
                    behaviorHints: {
                        notWebReady: false,
                        bingeGroup: 'hyperstreamrr'
                    }
                }
            ]
        };
    } catch (error) {
        console.error('Stream error:', error);
        return { streams: [] };
    }
});

// Export addon
const addonInterface = builder.getInterface();

// Create Express server
const app = express();
app.use(cors());
app.use(addonInterface);

const PORT = process.env.PORT || 7000;

// Start server
app.listen(PORT, () => {
    console.log(`HyperStreamrr Stremio addon running on port ${PORT}`);
    console.log(`Addon URL: http://localhost:${PORT}/manifest.json`);
    
    // Try to connect to HyperStreamrr
    hyperStreamrr.connect().catch(error => {
        console.error('Failed to connect to HyperStreamrr:', error);
        console.log('Make sure HyperStreamrr is running with WebSocket server enabled');
    });
});

module.exports = { app, hyperStreamrr };