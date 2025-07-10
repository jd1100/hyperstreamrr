// src/network.js
import Autobase from 'autobase';
import Hyperdrive from 'hyperdrive';
import Hyperswarm from 'hyperswarm';
import Corestore from 'corestore';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import path from 'path';
import fs from 'fs';
import { openView, applyChanges } from './db.js';
import { createInvite as createInviteFunc } from './crypto.js';
import { getFileType } from './utils.js';
import { WebTunnelServer } from './web-tunnel.js';

export class HyperShareNetwork {
  constructor() {
    this.networks = new Map();
    this.activeNetwork = null;
    this.ready = false;
    this.storagePath = null;
    this.localStore = null;
    this.networksCore = null;
    this.driveCache = new Map();
    this.drivesListCache = null;
    this.cacheTimeout = null;
    this.webTunnel = null;
  }

  async init() {
    console.log('HyperShareNetwork.init() called');
    this.storagePath = Pear.config.storage;
    console.log('Storage path from Pear.config.storage:', this.storagePath);
    
    // Initialize local hypercore storage for network persistence
    await this.initLocalStorage();
    
    await this.loadSavedNetworks();
    
    // Initialize web tunnel for cross-network access
    this.initWebTunnel();
    
    this.ready = true;
    console.log('HyperShareNetwork initialization complete. Ready:', this.ready);
    console.log('Networks loaded:', this.networks.size);
    console.log('Active network:', this.activeNetwork ? this.activeNetwork.name : 'None');
  }

  async initLocalStorage() {
    try {
      console.log('Initializing local hypercore storage...');
      console.log('Storage path:', this.storagePath);
      const localStoragePath = path.join(this.storagePath, 'local-networks');
      console.log('Local storage path:', localStoragePath);
      
      this.localStore = new Corestore(localStoragePath);
      
      // Create or load the networks hypercore
      this.networksCore = this.localStore.get({ name: 'networks' });
      await this.networksCore.ready();
      
      console.log('Local hypercore storage initialized successfully');
      console.log('Networks core length:', this.networksCore.length);
    } catch (error) {
      console.error('Failed to initialize local storage:', error);
      // Fallback to JSON file storage if hypercore fails
      this.localStore = null;
      this.networksCore = null;
    }
  }

  initWebTunnel() {
    try {
      // Check for tunnel configuration (can be set via settings)
      const enableRemoteAccess = localStorage?.getItem('hyperstreamrr_remote_access') === 'true';
      const authKey = localStorage?.getItem('hyperstreamrr_auth_key');
      
      this.webTunnel = new WebTunnelServer(this, {
        port: 8080,
        enableRemoteAccess: enableRemoteAccess,
        authKey: authKey,
        maxConnections: 50
      });
      
      this.webTunnel.start();
      
      console.log('🔐 Web tunnel initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize web tunnel:', error);
    }
  }

  async createNetwork(name, description) {
    const storagePathString = path.join(this.storagePath, 'networks', crypto.randomBytes(16).toString('hex'));
    const store = new Corestore(storagePathString);

    const autobase = new Autobase(store, null, {
      apply: applyChanges,
      open: openView,
      valueEncoding: 'json'
    });

    await autobase.ready();
    await autobase.view.ready();

    const swarm = new Hyperswarm();
    Pear.teardown(() => swarm.destroy());
    swarm.on('connection', conn => {
      console.log('[Swarm] Connection established');
      store.replicate(conn);
      autobase.replicate(conn);
      conn.on('error', e => console.error('[Swarm] Connection error:', e));
    });
    swarm.on('update', () => {
      console.log('[Swarm] Swarm updated, topics:', Array.from(swarm.topics.keys()).map(t => t.toString('hex')));
    });

    swarm.join(autobase.discoveryKey, { server: true, client: true });
    
    const adminKeypair = crypto.keyPair();
    const adminPublicKey = b4a.toString(adminKeypair.publicKey, 'hex');
    
    await autobase.append({
      type: 'ADD_ADMIN',
      writerKey: b4a.toString(autobase.local.key, 'hex'),
      name: 'Founder',
      founder: true,
      timestamp: Date.now(),
      adminPublicKey: adminPublicKey
    });

    const userDrive = new Hyperdrive(store.namespace('user-drive'));
    await userDrive.ready();
    swarm.join(userDrive.discoveryKey, { server: true, client: true });
    
    const network = {
      key: b4a.toString(autobase.key, 'hex'),
      name, description, role: 'admin', autobase, store, swarm, userDrive,
      storage: storagePathString, created: Date.now(),
      adminKeypair: adminKeypair
    };

    this.networks.set(network.key, network);
    this.activeNetwork = network;
    await this.saveNetworkInfo(network);

    // Start monitoring for writer addition requests since this is a founding admin
    this.startWriterAdditionMonitoring(network);

    return {
      network,
      adminInvite: this.createInvite(network, 'admin'),
      readerInvite: this.createInvite(network, 'reader')
    };
  }

  createInvite(network, role, inviteeName = 'New Member') {
    // Additional check to ensure admin role has keypair
    if (role === 'admin' && (!network.adminKeypair || network.role !== 'admin')) {
      console.error('Cannot create admin invite: network role is', network.role, 'and adminKeypair exists:', !!network.adminKeypair);
      throw new Error('Cannot create admin invite: insufficient permissions or missing admin keypair');
    }
    return createInviteFunc(network, role, inviteeName);
  }

  isAdminWriter() {
    if (!this.activeNetwork || this.activeNetwork.role !== 'admin') {
      return false;
    }
    return this.activeNetwork.autobase.writable;
  }

  getAdminStatus() {
    if (!this.activeNetwork) {
      return { isAdmin: false, canWrite: false, message: 'No active network' };
    }
    
    const isAdmin = this.activeNetwork.role === 'admin';
    const canWrite = this.activeNetwork.autobase.writable;
    
    let message = '';
    if (isAdmin && canWrite) {
      message = 'Full admin access';
    } else if (isAdmin && !canWrite) {
      message = 'Admin (can create invites, but cannot publish/unpublish drives)';
    } else {
      message = 'Reader access';
    }
    
    return { isAdmin, canWrite, message };
  }

  getLocalKey() {
    if (!this.activeNetwork) return null;
    return b4a.toString(this.activeNetwork.autobase.local.key, 'hex');
  }

  async joinNetwork(inviteCode) {
    try {
      const invite = JSON.parse(b4a.toString(b4a.from(inviteCode, 'base64')));

      if (this.networks.has(invite.network)) {
        throw new Error('You are already a member of this network');
      }

      const storagePathString = path.join(this.storagePath, 'networks', crypto.randomBytes(16).toString('hex'));
      const store = new Corestore(storagePathString);
      
      const swarm = new Hyperswarm();
      Pear.teardown(() => swarm.destroy());

      const autobase = new Autobase(store, b4a.from(invite.network, 'hex'), {
        apply: applyChanges,
        open: openView,
        valueEncoding: 'json'
      });

      await autobase.ready();
      await autobase.view.ready();

      swarm.on('connection', conn => {
        console.log('[Swarm] Connection established');
        store.replicate(conn);
        autobase.replicate(conn);
        conn.on('error', e => console.error('[Swarm] Connection error:', e));
      });
      swarm.on('update', () => {
        console.log('[Swarm] Swarm updated, topics:', Array.from(swarm.topics.keys()).map(t => t.toString('hex')));
      });

      swarm.join(autobase.discoveryKey, { server: true, client: true });

      const userDrive = new Hyperdrive(store.namespace('user-drive'));
      await userDrive.ready();
      swarm.join(userDrive.discoveryKey, { server: true, client: true });

      const network = {
        key: b4a.toString(autobase.key, 'hex'),
        name: invite.name,
        role: 'reader',
        autobase,
        store,
        swarm,
        userDrive,
        storage: storagePathString,
        created: Date.now(),
        pendingAdminAuth: invite.role === 'admin' ? invite.adminAuth : null
      };

      this.networks.set(network.key, network);
      this.activeNetwork = network;

      if (network.pendingAdminAuth) {
        this.listenForAdminPromotion(network);
      }

      await this.saveNetworkInfo(network);
      return network;
    } catch (error) {
      console.error('Failed to join network:', error);
      throw new Error('Invalid invite code');
    }
  }

  listenForAdminPromotion(network) {
    const handler = async () => {
      if (!network.pendingAdminAuth) {
        network.autobase.removeListener('update', handler);
        return;
      }

      const success = await this.processAdminAuthorization(network);
      
      if (success) {
        network.autobase.removeListener('update', handler);
      }
    };
    
    network.autobase.on('update', handler);
    handler();
  }

  async processAdminAuthorization(network) {
    if (!network.pendingAdminAuth) return false;

    const { message, signature, adminPublicKey } = network.pendingAdminAuth;
    const db = network.autobase.view;

    try {
      await network.autobase.update();
      const adminRegistry = await this.getAdminRegistry(db);

      if (adminRegistry.length === 0) {
        return false;
      }

      const messageBuffer = b4a.from(JSON.stringify(message));
      const signatureBuffer = b4a.from(signature, 'hex');

      let isValid = false;
      for (const admin of adminRegistry) {
        if (admin.adminPublicKey === adminPublicKey) {
          const publicKeyBuffer = b4a.from(admin.adminPublicKey, 'hex');
          if (crypto.verify(messageBuffer, signatureBuffer, publicKeyBuffer)) {
            isValid = true;
            break;
          }
        }
      }

      if (isValid) {
        console.log('Admin authorization successful, promoting user to admin');
        network.role = 'admin';
        network.pendingAdminAuth = null;

        network.adminKeypair = crypto.keyPair();
        const newAdminPublicKey = b4a.toString(network.adminKeypair.publicKey, 'hex');
        
        console.log('Generated admin keypair for promoted user');
        console.log('New admin public key:', newAdminPublicKey);

        // Add the newly promoted admin to the admin registry
        // Note: They won't be able to write this until existing admins add them as writers
        try {
          // This will fail if they're not a writer yet, but that's expected
          await network.autobase.append({
            type: 'ADD_ADMIN',
            writerKey: b4a.toString(network.autobase.local.key, 'hex'),
            name: message.inviteeName || 'New Admin',
            founder: false,
            timestamp: Date.now(),
            adminPublicKey: newAdminPublicKey
          });
          console.log('Successfully added admin to registry');
        } catch (error) {
          console.log('Expected error: Admin not yet a writer, will be added by existing writers');
        }

        // Signal that this user needs to be added as a writer
        const newAdminKey = b4a.toString(network.autobase.local.key, 'hex');
        await this.requestWriterAddition(network, newAdminKey, message.inviteeName || 'New Admin', newAdminPublicKey);

        await this.saveNetworkInfo(network);
        console.log('Admin role and keypair saved to network info');

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('role-updated', { detail: { role: 'admin' } }));
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error processing admin authorization:', error);
      return false;
    }
  }

  async requestWriterAddition(network, writerKey, name, adminPublicKey) {
    console.log('Requesting writer addition for:', name, writerKey);
    
    // Store the writer request in the local hypercore
    if (this.networksCore) {
      const writerRequest = {
        type: 'WRITER_REQUEST',
        networkKey: network.key,
        writerKey: writerKey,
        name: name,
        adminPublicKey: adminPublicKey,
        timestamp: Date.now(),
        status: 'pending'
      };
      
      try {
        await this.networksCore.append(JSON.stringify(writerRequest));
        console.log('Writer request stored in local hypercore');
      } catch (error) {
        console.error('Failed to store writer request:', error);
      }
    }
    
    // Set up a listener to check when we become writable
    const checkWriterStatus = async () => {
      if (network.autobase.writable) {
        console.log('Admin has been granted writer access!');
        network.autobase.removeListener('update', checkWriterStatus);
        
        // Update the writer request status
        if (this.networksCore) {
          const statusUpdate = {
            type: 'WRITER_STATUS_UPDATE',
            networkKey: network.key,
            writerKey: writerKey,
            status: 'granted',
            timestamp: Date.now()
          };
          
          try {
            await this.networksCore.append(JSON.stringify(statusUpdate));
          } catch (error) {
            console.error('Failed to update writer status:', error);
          }
        }
      }
    };
    
    network.autobase.on('update', checkWriterStatus);
    
    // Check immediately in case we're already writable
    checkWriterStatus();
  }

  async getAdminRegistry(db) {
    const adminRegistry = [];
    
    try {
      const prefix = '/admins/';
      for await (const node of db.createReadStream({ gt: prefix, lt: prefix + '~' })) {
        if (node.value) {
          adminRegistry.push(node.value);
        }
      }
    } catch (error) {
      console.error('Error reading admin registry:', error);
    }
    
    return adminRegistry;
  }

  async getDriveStats(driveKey) {
    if (!this.activeNetwork) return null;
    
    try {
      const drive = await this.getDrive(driveKey);
      if (!drive) return null;

      // Quick update without waiting for full sync
      await drive.update();

      const stats = {
        peers: drive.core.peers.length,
        totalBlocks: drive.core.length,
        downloadedBlocks: drive.core.contiguousLength || 0,
        uploadedBytes: drive.core.stats?.totals?.uploadedBytes || 0,
        downloadedBytes: drive.core.stats?.totals?.downloadedBytes || 0,
        connected: drive.core.peers.length > 0
      };

      // Check if blobs core exists and has the expected methods
      if (drive.blobs && drive.blobs.core) {
        try {
          if (typeof drive.blobs.core.update === 'function') {
            await drive.blobs.core.update();
          }
          stats.totalBlocks += drive.blobs.core.length || 0;
          stats.downloadedBlocks += drive.blobs.core.contiguousLength || 0;
          stats.uploadedBytes += drive.blobs.core.stats?.totals?.uploadedBytes || 0;
          stats.downloadedBytes += drive.blobs.core.stats?.totals?.downloadedBytes || 0;
        } catch (blobError) {
          console.log('Blob stats unavailable:', blobError.message);
        }
      }

      return stats;
    } catch (error) {
      console.error('Error getting drive stats:', error);
      return null;
    }
  }

  async startWriterAdditionMonitoring(network) {
    console.log('Starting writer addition monitoring for network:', network.name);
    
    // Monitor autobase updates to detect new admin additions
    const handleAdminAddition = async () => {
      if (!network.autobase.writable) return;
      
      try {
        await network.autobase.update();
        const db = network.autobase.view;
        
        // Check for new admins that aren't writers yet
        const adminRegistry = await this.getAdminRegistry(db);
        
        for (const admin of adminRegistry) {
          if (!admin.founder && admin.writerKey) {
            // Check if this admin is already a writer
            const isWriter = await this.isAdminWriter(network, admin.writerKey);
            
            if (!isWriter) {
              console.log('Found non-writer admin:', admin.name, admin.writerKey);
              await this.addAdminAsWriter(network, admin.writerKey, admin.name);
            }
          }
        }
      } catch (error) {
        console.error('Error in writer addition monitoring:', error);
      }
    };
    
    // Also monitor local hypercore for writer requests
    const handleWriterRequests = async () => {
      if (!this.networksCore || !network.autobase.writable) return;
      
      try {
        // Check recent entries in the networks hypercore for writer requests
        const recentStart = Math.max(0, this.networksCore.length - 100); // Check last 100 entries
        
        for (let i = recentStart; i < this.networksCore.length; i++) {
          const entry = await this.networksCore.get(i);
          if (entry) {
            const data = JSON.parse(entry.toString());
            
            if (data.type === 'WRITER_REQUEST' && 
                data.networkKey === network.key && 
                data.status === 'pending') {
              
              // Check if this admin is already a writer
              const isWriter = await this.isAdminWriter(network, data.writerKey);
              
              if (!isWriter) {
                console.log('Processing writer request:', data.name, data.writerKey);
                await this.addAdminAsWriter(network, data.writerKey, data.name);
                
                // Also add them to the admin registry now that they're a writer
                await network.autobase.append({
                  type: 'ADD_ADMIN',
                  writerKey: data.writerKey,
                  name: data.name,
                  founder: false,
                  timestamp: Date.now(),
                  adminPublicKey: data.adminPublicKey
                });
                
                console.log('Added promoted admin to registry:', data.name);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing writer requests:', error);
      }
    };
    
    // Listen for autobase updates
    network.autobase.on('update', handleAdminAddition);
    
    // Listen for local hypercore updates (writer requests)
    if (this.networksCore) {
      this.networksCore.on('append', handleWriterRequests);
    }
    
    // Check immediately
    handleAdminAddition();
    handleWriterRequests();
  }

  async isAdminWriter(network, adminKey) {
    try {
      // Check if the admin key is in the list of writers
      const writers = network.autobase.inputs || [];
      return writers.some(writer => b4a.toString(writer.key, 'hex') === adminKey);
    } catch (error) {
      console.error('Error checking if admin is writer:', error);
      return false;
    }
  }

  async addAdminAsWriter(network, adminKey, adminName) {
    try {
      console.log('Adding admin as writer:', adminName, adminKey);
      
      // Add the admin key to the autobase
      await network.autobase.addWriter(b4a.from(adminKey, 'hex'), {
        indexer: true
      });
      
      console.log('Successfully added admin as writer:', adminName);
      
    } catch (error) {
      console.error('Failed to add admin as writer:', error);
    }
  }

  async getNetworkStats() {
    if (!this.activeNetwork) throw new Error('No active network');
    
    await this.activeNetwork.autobase.update();
    
    const db = this.activeNetwork.autobase.view;
    let totalDrives = 0;
    let totalFiles = 0;
    let totalSize = 0;
    
    if (db) {
      const prefix = '/drives/';
      for await (const node of db.createReadStream({ gt: prefix, lt: prefix + '~' })) {
        totalDrives++;
        totalFiles += node.value.stats?.fileCount || 0;
        totalSize += node.value.stats?.totalSize || 0;
      }
    }
    
    return {
      drives: totalDrives,
      files: totalFiles,
      size: totalSize,
      peers: this.activeNetwork.swarm.connections.size,
      swarm: this.getSwarmStats()
    };
  }

  getSwarmStats() {
    if (!this.activeNetwork) return null;

    const swarm = this.activeNetwork.swarm;
    const stats = swarm.stats;

    return {
      peers: swarm.connections.size,
      connecting: swarm.connecting,
      topics: swarm.topics.size,
      uploadedBytes: stats?.totals?.uploadedBytes || 0,
      downloadedBytes: stats?.totals?.downloadedBytes || 0,
      seedRatio: this.calculateSeedRatio(stats)
    };
  }

  calculateSeedRatio(stats) {
    if (!stats?.totals) return 0;
    const uploaded = stats.totals.uploadedBytes || 0;
    const downloaded = stats.totals.downloadedBytes || 0;
    return downloaded > 0 ? (uploaded / downloaded) : (uploaded > 0 ? 999 : 0);
  }

  async getDetailedNetworkStats() {
    if (!this.activeNetwork) return null;
    
    const basicStats = await this.getNetworkStats();
    const swarmStats = this.getSwarmStats();
    
    return {
      ...basicStats,
      swarm: swarmStats,
      driveStats: await this.getAllDriveStats()
    };
  }

  async getAllDriveStats() {
    if (!this.activeNetwork) return [];
    
    const drives = await this.browseDrives({}, true);
    const driveStats = [];
    
    for (const drive of drives) {
      const stats = await this.getDriveStats(drive.key);
      if (stats) {
        driveStats.push({
          key: drive.key,
          name: drive.name,
          ...stats
        });
      }
    }
    
    return driveStats;
  }

  async scanDrive(drive) {
    const files = [];
    try {
      for await (const entry of drive.list('/', { recursive: true })) {
        if (entry.value && !entry.value.linkname) {
          files.push({
            path: entry.key,
            name: entry.key.split('/').pop(),
            size: entry.value.blob ? entry.value.blob.byteLength : 0,
            type: getFileType(entry.key),
            mtime: entry.value.metadata?.mtime || Date.now()
          });
        }
      }
    } catch (error) {
      console.error('Error scanning drive:', error);
    }
    return files;
  }

  async publishDrive(metadata) {
    if (!this.activeNetwork || this.activeNetwork.role !== 'admin') throw new Error('Action not allowed');
    
    const network = this.activeNetwork;
    const db = network.autobase.view;
    const localKeyHex = b4a.toString(network.autobase.local.key, 'hex');
    
    const adminNode = await db.get(`/admins/${localKeyHex}`);
    const ownerName = adminNode ? adminNode.value.name : 'Anonymous';
    
    const files = await this.scanDrive(network.userDrive);
    
    try {
      await network.autobase.append({
        type: 'PUBLISH_DRIVE',
        driveKey: b4a.toString(network.userDrive.key, 'hex'),
        topic: b4a.toString(network.userDrive.discoveryKey, 'hex'),
        metadata: {
          ...metadata,
          ownerId: localKeyHex,
          ownerName: ownerName,
          stats: {
            totalSize: files.reduce((sum, f) => sum + f.size, 0),
            fileCount: files.length
          }
        },
        files: files,
        timestamp: Date.now()
      });
      console.log('Drive published successfully');
    } catch (error) {
      if (error.message === 'Not writable') {
        throw new Error('Cannot publish drive: You need to be added as a writer by an existing admin first');
      }
      throw error;
    }
  }

  async unpublishDrive(driveKey) {
    if (!this.activeNetwork || this.activeNetwork.role !== 'admin') throw new Error('Action not allowed');

    try {
      await this.activeNetwork.autobase.append({
        type: 'UNPUBLISH_DRIVE',
        driveKey: driveKey,
        timestamp: Date.now()
      });
      console.log('Drive unpublished successfully');
    } catch (error) {
      if (error.message === 'Not writable') {
        throw new Error('Cannot unpublish drive: You need to be added as a writer by an existing admin first');
      }
      throw error;
    }
  }

  async getMyDrives() {
    if (!this.activeNetwork) return [];
    await this.activeNetwork.autobase.update();
    const db = this.activeNetwork.autobase.view;
    if (!db) return [];

    const drives = [];
    const localKey = b4a.toString(this.activeNetwork.autobase.local.key, 'hex');

    const prefix = '/drives/';
    for await (const node of db.createReadStream({ gt: prefix, lt: prefix + '~' })) {
      if (node.value.owner.id === localKey) {
        drives.push({ key: node.key.replace(prefix, ''), ...node.value });
      }
    }
    
    return drives;
  }

  async uploadFile(filePath, content) {
    if (!this.activeNetwork) throw new Error('No active network');
    await this.activeNetwork.userDrive.put(filePath, content);
  }

  createFileUploadStream(filePath) {
    if (!this.activeNetwork) throw new Error('No active network');
    return this.activeNetwork.userDrive.createWriteStream(filePath);
  }

  async createFileDownloadStream(driveKey, filePath) {
    if (!this.activeNetwork) throw new Error('No active network');
    const drive = await this.getDrive(driveKey);
    return drive.createReadStream(filePath);
  }

  async deleteFile(driveKey, filePath) {
    if (!this.activeNetwork) throw new Error('No active network');
    
    const userDriveKey = b4a.toString(this.activeNetwork.userDrive.key, 'hex');
    if (driveKey !== userDriveKey) {
      throw new Error('You can only delete files from your own drive');
    }
    
    await this.activeNetwork.userDrive.del(filePath);
  }

  async browseDrives(filters = {}, force = false) {
    if (!this.activeNetwork) return [];

    if (this.drivesListCache && !force && (this.cacheTimeout > Date.now())) {
      return this.drivesListCache;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('loading-drives-start'));
    }

    // Force network sync first
    await this.activeNetwork.autobase.update();
    
    const db = this.activeNetwork.autobase.view;
    if (!db) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loading-drives-end'));
      }
      return [];
    }
    
    const drives = [];
    const prefix = '/drives/';
    let processedCount = 0;
    const startTime = Date.now();
    const maxProcessingTime = 30000; // 30 seconds max
    
    try {
      for await (const node of db.createReadStream({ gt: prefix, lt: prefix + '~' })) {
        // Check for timeout to prevent infinite loops
        if (Date.now() - startTime > maxProcessingTime) {
          console.warn('Drive discovery timeout reached, stopping scan');
          break;
        }
        
        const value = node.value;
      
        // Filter logic
        if (filters.verified && !value.verified) continue;
        if (filters.category && !value.categories?.includes(filters.category)) continue;
        
        // Get drive stats if available (async, non-blocking)
        try {
          const driveKey = node.key.replace(prefix, '');
          // Skip stats for now to avoid blocking - we can load them later
          value.connectionStats = {
            peers: 0,
            downloadedBlocks: 0,
            totalBlocks: 0,
            completeness: 0
          };
          
          // Load stats asynchronously without blocking
          this.getDriveStats(driveKey).then(driveStats => {
            if (driveStats && this.drivesListCache) {
              const cachedDrive = this.drivesListCache.find(d => d.key === driveKey);
              if (cachedDrive) {
                cachedDrive.connectionStats = {
                  peers: driveStats.peers,
                  downloadedBlocks: driveStats.downloadedBlocks,
                  totalBlocks: driveStats.totalBlocks,
                  completeness: driveStats.totalBlocks > 0 ? (driveStats.downloadedBlocks / driveStats.totalBlocks) * 100 : 0
                };
                
                // Update UI if needed
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('drive-stats-updated', {
                    detail: { driveKey, stats: cachedDrive.connectionStats }
                  }));
                }
              }
            }
          }).catch(error => {
            console.log('Failed to get stats for drive:', driveKey, error.message);
          });
        } catch (error) {
          console.error('Error setting up drive stats:', error);
        }
        
        drives.push({ key: node.key.replace(prefix, ''), ...value });
        processedCount++;
        
        // Send progress updates every 5 drives
        if (typeof window !== 'undefined' && processedCount % 5 === 0) {
          window.dispatchEvent(new CustomEvent('loading-drives-progress', {
            detail: { processed: processedCount }
          }));
        }
      }
    } catch (error) {
      console.error('Error during drive discovery:', error);
    }
    
    this.drivesListCache = drives;
    this.cacheTimeout = Date.now() + 30000; // 30 second cache

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('loading-drives-end', {
        detail: { totalDrives: drives.length }
      }));
    }

    return drives;
  }

  async searchFiles(query, filters = {}) {
    if (!this.activeNetwork) return [];
    await this.activeNetwork.autobase.update();
    const db = this.activeNetwork.autobase.view;
    if (!db) return [];
    
    const results = [];
    const searchTerm = query.toLowerCase();
    
    const prefix = `/search/files/${searchTerm}`;
    for await (const node of db.createReadStream({ gt: prefix, lt: prefix + '~' })) {
      if (node.value.ref) {
        const fileNode = await db.get(node.value.ref);
        if (fileNode?.value) {
          const file = fileNode.value;
          if (filters.minSize && file.size < filters.minSize) continue;
          if (filters.maxSize && file.size > filters.maxSize) continue;
          results.push(file);
        }
      }
      if (results.length >= 100) break;
    }
    
    return results;
  }

  async browseFiles(driveKey, path = '/') {
    if (!this.activeNetwork) return [];

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('loading-files-start', { detail: { driveKey } }));
    }
    
    const drive = await this.getDrive(driveKey);
    const files = [];
    
    try {
      for await (const entry of drive.list(path, { recursive: false })) {
        if (entry.key === path) continue;
        
        let relativePath = entry.key.slice(path.length);
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
        
        if (relativePath.includes('/')) {
          const dirName = relativePath.split('/')[0];
          const dirPath = path === '/' ? `/${dirName}` : `${path}/${dirName}`;
          
          if (!files.find(f => f.path === dirPath)) {
            files.push({
              path: dirPath,
              name: dirName,
              size: 0,
              isDirectory: true,
              mtime: Date.now()
            });
          }
        } else {
          files.push({
            path: entry.key,
            name: entry.key.split('/').pop(),
            size: entry.value.blob ? entry.value.blob.byteLength : 0,
            isDirectory: false,
            mtime: entry.value.metadata?.mtime || Date.now()
          });
        }
      }
    } catch (error) {
      console.error('Error browsing files:', error);
    } finally {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loading-files-end', { detail: { driveKey } }));
      }
    }
    
    return files;
  }

  async downloadFile(driveKey, filePath) {
    if (!this.activeNetwork) throw new Error('No active network');
    const drive = await this.getDrive(driveKey);
    return await drive.get(filePath);
  }

  async getDrive(driveKey) {
    const network = this.activeNetwork;
    if (!network) throw new Error('No active network');

    if (this.driveCache.has(driveKey)) {
        return this.driveCache.get(driveKey);
    }

    const userDriveKey = b4a.toString(network.userDrive.key, 'hex');
    if (driveKey === userDriveKey) return network.userDrive;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('drive-connecting', {
        detail: { driveKey, status: 'connecting' }
      }));
    }

    const key = b4a.from(driveKey, 'hex');
    const drive = new Hyperdrive(network.store, key);
    await drive.ready();

    network.swarm.join(drive.discoveryKey, { server: true, client: true });
    
    // Set up connection tracking
    drive.core.on('peer-add', () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('drive-peer-connected', {
          detail: { driveKey, peers: drive.core.peers.length }
        }));
      }
    });
    
    drive.core.on('peer-remove', () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('drive-peer-disconnected', {
          detail: { driveKey, peers: drive.core.peers.length }
        }));
      }
    });
    
    // Quick update to get basic info
    await drive.update();

    this.driveCache.set(driveKey, drive);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('drive-connected', {
        detail: { driveKey, peers: drive.core.peers.length }
      }));
    }

    return drive;
  }

  async reannounceDrives() {
    if (!this.activeNetwork) return;
    console.log('[Swarm] Re-announcing all known drives...');

    // Announce the main network topic
    this.activeNetwork.swarm.join(this.activeNetwork.autobase.discoveryKey);

    // Announce all cached drives
    for (const drive of this.driveCache.values()) {
      this.activeNetwork.swarm.join(drive.discoveryKey);
    }
    console.log('[Swarm] Re-announcement complete.');
  }

  async waitForDriveSync(drive, timeout = 3000) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('drive-sync-start', { detail: { driveKey: b4a.toString(drive.key, 'hex') } }));
    }

    await drive.update();
    if (drive.core.length > 1 && drive.core.contiguousLength === drive.core.length) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('drive-sync-end', { detail: { driveKey: b4a.toString(drive.key, 'hex') } }));
      }
      return;
    }

    const promise = new Promise(resolve => {
      const timer = setTimeout(resolve, timeout);
      drive.core.once('download', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await promise;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('drive-sync-end', { detail: { driveKey: b4a.toString(drive.key, 'hex') } }));
    }
  }

  async saveNetworkInfo(network) {
    const info = {
      key: network.key,
      name: network.name,
      description: network.description,
      role: network.role,
      storage: network.storage,
      created: network.created,
      adminKeypair: network.adminKeypair ? {
        publicKey: b4a.toString(network.adminKeypair.publicKey, 'hex'),
        secretKey: b4a.toString(network.adminKeypair.secretKey, 'hex')
      } : null
    };

    // --- DEBUGGING LOG ---
    console.log('--- Saving Network Info ---');
    console.log('Time:', new Date().toISOString());
    console.log('Network Name:', info.name);
    console.log('Role being saved:', info.role);
    console.log('Admin Keypair exists:', !!info.adminKeypair);
    if (info.role === 'admin' && !info.adminKeypair) {
      console.error('CRITICAL: Saving admin role without a keypair!');
      console.trace();
    }
    console.log('--------------------------');
    // --- END DEBUGGING LOG ---
    
    const networksPath = path.join(this.storagePath, 'networks.json');
    let networks = [];
    
    try {
      networks = JSON.parse(await fs.promises.readFile(networksPath, 'utf8'));
    } catch (e) {}
    
    const index = networks.findIndex(n => n.key === network.key);
    if (index >= 0) networks[index] = info;
    else networks.push(info);
    
    await fs.promises.writeFile(networksPath, JSON.stringify(networks, null, 2));
  }

  async saveNetworkInfoToFile(info) {
    const networksPath = path.join(this.storagePath, 'networks.json');
    let networks = [];
    
    try {
      networks = JSON.parse(await fs.promises.readFile(networksPath, 'utf8'));
    } catch (e) {}
    
    const index = networks.findIndex(n => n.key === info.key);
    if (index >= 0) networks[index] = info;
    else networks.push(info);
    
    await fs.promises.writeFile(networksPath, JSON.stringify(networks, null, 2));
  }

  async leaveNetwork(networkKey) {
    const network = this.networks.get(networkKey);
    if (!network) return;

    await network.swarm.destroy();
    await network.store.close();
    this.networks.delete(networkKey);

    if (this.activeNetwork && this.activeNetwork.key === networkKey) {
      this.activeNetwork = this.networks.size > 0 ? this.networks.values().next().value : null;
    }

    const networksPath = path.join(this.storagePath, 'networks.json');
    let networks = [];
    try {
      networks = JSON.parse(await fs.promises.readFile(networksPath, 'utf8'));
    } catch (e) {}

    const updatedNetworks = networks.filter(n => n.key !== networkKey);
    await fs.promises.writeFile(networksPath, JSON.stringify(updatedNetworks, null, 2));

    return this.activeNetwork;
  }

  async loadSavedNetworks() {
    const networksPath = path.join(this.storagePath, 'networks.json');
    
    try {
      const savedNetworks = JSON.parse(await fs.promises.readFile(networksPath, 'utf8'));
      
      for (const info of savedNetworks) {
        const store = new Corestore(info.storage);
        const swarm = new Hyperswarm();
        Pear.teardown(() => swarm.destroy());

        const autobase = new Autobase(store, b4a.from(info.key, 'hex'), {
          apply: applyChanges,
          open: openView,
          valueEncoding: 'json'
        });

        await autobase.ready();
        await autobase.view.ready();

        swarm.on('connection', conn => {
          store.replicate(conn);
          autobase.replicate(conn);
        });

        swarm.join(autobase.discoveryKey, { server: true, client: true });

        const userDrive = new Hyperdrive(store.namespace('user-drive'));
        await userDrive.ready();
        swarm.join(userDrive.discoveryKey, { server: true, client: true });

        const network = {
          key: info.key,
          name: info.name,
          description: info.description,
          storage: info.storage,
          created: info.created,
          autobase: autobase,
          store: store,
          swarm: swarm,
          userDrive: userDrive,
          role: info.role || 'reader',
          adminKeypair: null
        };

        if (network.role === 'admin') {
          if (info.adminKeypair) {
            try {
              network.adminKeypair = {
                publicKey: b4a.from(info.adminKeypair.publicKey, 'hex'),
                secretKey: b4a.from(info.adminKeypair.secretKey, 'hex')
              };
            } catch (e) {
              console.error(`Corrupt admin keypair for "${info.name}". Downgrading to reader.`, e);
              network.role = 'reader';
            }
          } else {
            console.warn(`Network "${info.name}" has admin role but no saved keypair. Downgrading to reader.`);
            network.role = 'reader';
          }
        }

        this.networks.set(network.key, network);
      }
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('Failed to load saved networks:', e);
    }
  }

  async loadNetworksFromHypercore() {
    const savedNetworks = [];
    
    try {
      console.log('Loading networks from hypercore, length:', this.networksCore.length);
      
      // Read all entries from the networks hypercore
      for (let i = 0; i < this.networksCore.length; i++) {
        const entry = await this.networksCore.get(i);
        if (entry) {
          const info = JSON.parse(entry.toString());
          
          // Filter out non-network entries (like writer requests)
          if (info.key && info.name && info.storage) {
            console.log('Found network in hypercore:', info.name);
            
            // Only add the latest version of each network (by key)
            const existing = savedNetworks.findIndex(n => n.key === info.key);
            if (existing >= 0) {
              savedNetworks[existing] = info; // Replace with newer version
            } else {
              savedNetworks.push(info);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load networks from hypercore:', error);
    }
    
    console.log('Loaded', savedNetworks.length, 'networks from hypercore');
    return savedNetworks;
  }

  async loadNetworksFromFile() {
    const networksPath = path.join(this.storagePath, 'networks.json');
    
    try {
      return JSON.parse(await fs.promises.readFile(networksPath, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('Failed to load networks from file:', e);
      return [];
    }
  }
}
