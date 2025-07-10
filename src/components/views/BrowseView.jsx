import React, { useState, useEffect } from 'react'
import { useNetwork } from '../../contexts/NetworkContext'

const BrowseView = () => {
  const { activeNetwork } = useNetwork()
  const [drives, setDrives] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadDrives()
  }, [activeNetwork])

  const loadDrives = async () => {
    if (!window.hyperShare || !activeNetwork) return

    try {
      setLoading(true)
      setError(null)
      const driveList = await window.hyperShare.browseDrives()
      setDrives(driveList)
    } catch (err) {
      console.error('Error loading drives:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadDrives()
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const renderDriveCard = (drive) => {
    const isAdmin = activeNetwork?.role === 'admin'
    const isOwner = isAdmin && drive.owner?.id === activeNetwork?.autobase?.local?.key?.toString('hex')

    return (
      <div key={drive.key} className="drive-card" onClick={() => browseDrive(drive.key, drive.name)}>
        <div className="drive-header">
          <div className="drive-title">
            {drive.name || 'Unnamed Drive'}
            {drive.verified && <span className="verified-badge">VERIFIED</span>}
          </div>
        </div>
        
        <div className="drive-owner">by {drive.owner?.name || 'Unknown'}</div>
        <div className="drive-description">{drive.description || 'No description'}</div>
        
        <div className="drive-stats">
          <span className="drive-stat"><strong>{formatBytes(drive.stats?.totalSize || 0)}</strong></span>
          <span className="drive-stat"><strong>{drive.stats?.fileCount || 0}</strong> files</span>
        </div>
        
        <div className="drive-tags">
          {(drive.tags || []).map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
        
        <div className="drive-actions">
          <button 
            className="btn" 
            onClick={(e) => {
              e.stopPropagation()
              browseDrive(drive.key, drive.name)
            }}
          >
            Browse Files
          </button>
          {isAdmin && !drive.verified && (
            <button 
              className="btn btn-secondary" 
              onClick={(e) => {
                e.stopPropagation()
                verifyDrive(drive.key)
              }}
            >
              Verify
            </button>
          )}
          {isOwner && (
            <button 
              className="btn btn-danger" 
              onClick={(e) => {
                e.stopPropagation()
                confirmUnpublish(drive.key)
              }}
            >
              Unpublish
            </button>
          )}
        </div>
      </div>
    )
  }

  const browseDrive = (driveKey, driveName) => {
    // TODO: Implement file browser navigation
    console.log('Browse drive:', driveKey, driveName)
  }

  const verifyDrive = async (driveKey) => {
    try {
      await window.hyperShare.verifyDrive(driveKey)
      alert('Drive verified!')
      loadDrives()
    } catch (error) {
      alert('Failed to verify drive: ' + error.message)
    }
  }

  const confirmUnpublish = async (driveKey) => {
    if (!confirm('Are you sure you want to unpublish this drive? This will remove it from the network index for all users.')) {
      return
    }

    try {
      await window.hyperShare.unpublishDrive(driveKey)
      alert('Unpublish event sent! The drive will be removed shortly.')
      setTimeout(() => loadDrives(), 1000)
    } catch (error) {
      alert('Failed to unpublish drive: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="view-header">
          <h1 className="view-title">Browse Drives</h1>
          <p className="view-description">Explore all published drives in the network</p>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading drives...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="view-header">
          <h1 className="view-title">Browse Drives</h1>
          <p className="view-description">Explore all published drives in the network</p>
        </div>
        <div className="error-state">
          <p style={{ color: 'var(--danger)' }}>Error loading drives: {error}</p>
          <button className="btn" onClick={handleRefresh}>Try Again</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">Browse Drives</h1>
        <p className="view-description">Explore all published drives in the network</p>
        <button className="btn btn-secondary" onClick={handleRefresh} style={{ marginTop: '10px' }}>
          🔄 Refresh
        </button>
      </div>
      
      <div className="drives-grid">
        {drives.length === 0 ? (
          <div className="empty-state">
            <div className="loading-content">
              <div className="spinner" style={{ marginBottom: '16px' }}></div>
              <h3>Discovering drives...</h3>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Connecting to peers and synchronizing the network database.
                This may take a few moments for new networks.
              </p>
              <button className="btn btn-secondary" onClick={handleRefresh}>Check Again</button>
            </div>
          </div>
        ) : (
          drives.map(drive => renderDriveCard(drive))
        )}
      </div>
    </div>
  )
}

export default BrowseView