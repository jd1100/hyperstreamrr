import React, { useState, useEffect } from 'react'
import { useNetwork } from '../../contexts/NetworkContext'
import { useUI } from '../../contexts/UIContext'

const MyDrivesView = () => {
  const { activeNetwork } = useNetwork()
  const { setCurrentView } = useUI()
  const [drives, setDrives] = useState([])
  const [loading, setLoading] = useState(true)

  const isAdmin = activeNetwork?.role === 'admin'

  useEffect(() => {
    loadMyDrives()
  }, [activeNetwork])

  const loadMyDrives = async () => {
    if (!window.hyperShare || !isAdmin) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const myDrives = await window.hyperShare.getMyDrives()
      setDrives(myDrives)
    } catch (error) {
      console.error('Error loading my drives:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const handleRepublish = async (driveKey) => {
    const drive = drives.find(d => d.key === driveKey)
    if (!drive) {
      alert('Drive not found!')
      return
    }

    // TODO: Pre-fill the publish form
    alert('Drive information will be pre-filled in the publish form.')
    setCurrentView('publish')
  }

  const confirmUnpublish = async (driveKey) => {
    if (!confirm('Are you sure you want to unpublish this drive? It will be removed for all users on the network.')) {
      return
    }

    try {
      await window.hyperShare.unpublishDrive(driveKey)
      alert('Drive unpublished successfully!')
      loadMyDrives()
    } catch (error) {
      alert('Failed to unpublish drive: ' + error.message)
    }
  }

  const renderMyDriveCard = (drive) => {
    return (
      <div key={drive.key} className="drive-card">
        <div className="drive-header">
          <div className="drive-title">
            {drive.name || 'Unnamed Drive'}
            {drive.verified && <span className="verified-badge">VERIFIED</span>}
          </div>
        </div>
        
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
          <button className="btn" onClick={() => handleRepublish(drive.key)}>
            Republish
          </button>
          <button className="btn btn-danger" onClick={() => confirmUnpublish(drive.key)}>
            Unpublish
          </button>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div>
        <div className="view-header">
          <h1 className="view-title">My Published Drives</h1>
          <p className="view-description">Manage the drives you've shared with the network</p>
        </div>
        <p>You do not have any published drives.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div>
        <div className="view-header">
          <h1 className="view-title">My Published Drives</h1>
          <p className="view-description">Manage the drives you've shared with the network</p>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading your drives...</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">My Published Drives</h1>
        <p className="view-description">Manage the drives you've shared with the network</p>
      </div>

      <div className="drives-grid">
        {drives.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>
            You haven't published any drives yet.
          </p>
        ) : (
          drives.map(drive => renderMyDriveCard(drive))
        )}
      </div>
    </div>
  )
}

export default MyDrivesView