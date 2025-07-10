import React from 'react'
import { useNetwork } from '../contexts/NetworkContext'
import { useUI } from '../contexts/UIContext'

const NavigationSidebar = () => {
  const { activeNetwork, stats, leaveNetwork } = useNetwork()
  const { currentView, setCurrentView, openModal } = useUI()

  const isAdmin = activeNetwork?.role === 'admin'

  const handleViewChange = (view) => {
    setCurrentView(view)
  }

  const handleNetworkInfo = () => {
    openModal('network-info')
  }

  const handleLeaveNetwork = () => {
    if (activeNetwork && confirm(`Are you sure you want to leave the network "${activeNetwork.name}"? This cannot be undone.`)) {
      leaveNetwork(activeNetwork.key)
    }
  }

  return (
    <div className="nav-sidebar">
      <div className="network-info">
        <div className="network-name" id="current-network-name">
          {activeNetwork?.name || 'Loading...'}
        </div>
        <span className={`network-role ${activeNetwork?.role || 'reader'}`} id="user-role">
          {(activeNetwork?.role || 'Reader').toUpperCase()}
        </span>
        <button 
          className="btn btn-secondary" 
          onClick={handleNetworkInfo}
          style={{ marginTop: '10px', width: '100%' }}
        >
          📋 Network Info
        </button>
        <button 
          className="btn btn-secondary" 
          onClick={handleLeaveNetwork}
          style={{ marginTop: '5px', width: '100%' }}
        >
          Leave Network
        </button>
      </div>

      <div className="nav-section">
        <h4>Browse</h4>
        <div 
          className={`nav-item ${currentView === 'browse' ? 'active' : ''}`}
          onClick={() => handleViewChange('browse')}
        >
          <span>🌐</span> All Drives
        </div>
        <div 
          className={`nav-item ${currentView === 'categories' ? 'active' : ''}`}
          onClick={() => handleViewChange('categories')}
        >
          <span>📁</span> Categories
        </div>
        <div 
          className={`nav-item ${currentView === 'verified' ? 'active' : ''}`}
          onClick={() => handleViewChange('verified')}
        >
          <span>✓</span> Verified Only
        </div>
      </div>

      <div className="nav-section">
        <h4>Personal</h4>
        <div 
          className={`nav-item ${currentView === 'downloads' ? 'active' : ''}`}
          onClick={() => handleViewChange('downloads')}
        >
          <span>⬇️</span> Downloads
        </div>
        <div 
          className={`nav-item ${currentView === 'my-drives' ? 'active' : ''}`}
          onClick={() => handleViewChange('my-drives')}
        >
          <span>💾</span> My Drives
        </div>
      </div>

      {isAdmin && (
        <div className="nav-section" id="admin-section">
          <h4>Admin</h4>
          <div 
            className={`nav-item ${currentView === 'publish' ? 'active' : ''}`}
            onClick={() => handleViewChange('publish')}
          >
            <span>📤</span> Publish Drive
          </div>
          <div 
            className={`nav-item ${currentView === 'manage-admins' ? 'active' : ''}`}
            onClick={() => handleViewChange('manage-admins')}
          >
            <span>👥</span> Manage Admins
          </div>
        </div>
      )}

      <div className="nav-section">
        <h4>Network Stats</h4>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label">Peers</div>
            <div className="stat-value" id="peer-count">{stats?.peers || 0}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Drives</div>
            <div className="stat-value" id="drive-count">{stats?.drives || 0}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Upload</div>
            <div className="stat-value" id="upload-speed">
              {stats?.swarm?.uploadSpeed ? formatSpeed(stats.swarm.uploadSpeed) : '0 B/s'}
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Download</div>
            <div className="stat-value" id="download-speed">
              {stats?.swarm?.downloadSpeed ? formatSpeed(stats.swarm.downloadSpeed) : '0 B/s'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Utility function
const formatSpeed = (bytes) => {
  if (bytes === 0) return '0 B/s'
  const k = 1024
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export default NavigationSidebar