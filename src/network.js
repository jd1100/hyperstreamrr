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

export class HyperShareNetwork {
  constructor() {
    this.networks = new Map();
    this.activeNetwork = null;
    this.ready = false;
    this.storagePath = null;
    this.localStore = null;
    this.networksCore = null;
    this.driveCache = null;
    this.cacheTimeout = null;
  }

  async init() {
    console.log('HyperShareNetwork.init() called');
    this.storagePath = Pear.config.storage;
    console.log('Storage path from Pear.config.storage:', this.storagePath);
    
    // Initialize local hypercore storage for network persistence
    await this.initLocalStorage();
    
    await this.loadSavedNetworks();
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
      store.replicate(conn);
      autobase.replicate(conn);
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
        store.replicate(conn);
        autobase.replicate(conn);
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
    const drive = await this.getDrive(driveKey);
    if (!drive) return null;

    await drive.update();

    const stats = {
      peers: drive.core.peers.length,
      totalBlocks: drive.core.length,
      downloadedBlocks: drive.core.downloaded()
    };

    if (drive.blobs) {
      await drive.blobs.update();
      stats.totalBlocks += drive.blobs.core.length;
      stats.downloadedBlocks += drive.blobs.core.downloaded();
    }

    return stats;
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
      uploadedBytes: stats.totals.uploadedBytes,
      downloadedBytes: stats.totals.downloadedBytes
    };
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

    if (this.driveCache && !force && (this.cacheTimeout > Date.now())) {
      return this.driveCache;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('loading-drives-start'));
    }

    await this.activeNetwork.autobase.update();
    
    const db = this.activeNetwork.autobase.view;
    if (!db) return [];
    
    const drives = [];
    const prefix = '/drives/';
    for await (const node of db.createReadStream({ gt: prefix, lt: prefix + '~' })) {
      const value = node.value;
      if (filters.verified && !value.verified) continue;
      if (filters.category && !value.categories?.includes(filters.category)) continue;
      drives.push({ key: node.key.replace(prefix, ''), ...value });
    }
    
    this.driveCache = drives;
    this.cacheTimeout = Date.now() + 30000; // 30 second cache

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('loading-drives-end'));
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

    const userDriveKey = b4a.toString(network.userDrive.key, 'hex');
    if (driveKey === userDriveKey) return network.userDrive;

    const key = b4a.from(driveKey, 'hex');
    const drive = new Hyperdrive(network.store, key);
    await drive.ready();

    network.swarm.join(drive.discoveryKey, { server: false, client: true });
    
    await this.waitForDriveSync(drive);
    return drive;
  }

  async waitForDriveSync(drive, timeout = 5000) {
    await drive.update();
    if (drive.core.length > 1) return;

    const promise = new Promise(resolve => {
      const timer = setTimeout(resolve, timeout);
      drive.core.once('download', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    await promise;
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
