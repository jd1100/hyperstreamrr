export default {
  // Set this to join an existing network
  // Leave null to create a new network
  bootstrapKey: null,
  
  // Network configuration
  networkName: 'P2P Fileshare Network',
  
  // File upload limits
  maxFileSize: 5 * 1024 * 1024 * 1024, // 5GB
  maxFilesPerUpload: 50,
  
  // Auto-publish drive after uploads
  autoPublish: false,
  
  // Search configuration
  search: {
    maxResults: 50,
    minQueryLength: 2
  },
  
  // Replication settings
  replication: {
    maxPeers: 32,
    sparse: true,
    live: true
  },
  
  // UI settings
  ui: {
    theme: 'dark',
    showPeerCount: true,
    showFileDetails: true
  }
}