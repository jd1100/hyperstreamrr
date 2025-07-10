import React, { useState } from 'react'
import { useNetwork } from '../../contexts/NetworkContext'
import { useUI } from '../../contexts/UIContext'

const PublishView = () => {
  const { activeNetwork } = useNetwork()
  const { setCurrentView } = useUI()
  const [driveName, setDriveName] = useState('')
  const [driveDescription, setDriveDescription] = useState('')
  const [driveTags, setDriveTags] = useState('')

  const isAdmin = activeNetwork?.role === 'admin'

  const handleUploadFiles = () => {
    // TODO: Implement file upload modal
    alert('File upload modal coming soon!')
  }

  const handlePublishDrive = async () => {
    if (!driveName.trim()) {
      alert('Please enter a drive name')
      return
    }

    if (!window.hyperShare) {
      alert('HyperShare not initialized')
      return
    }

    try {
      const tags = driveTags.split(',').map(t => t.trim()).filter(t => t)
      
      await window.hyperShare.publishDrive({
        name: driveName,
        description: driveDescription,
        tags,
        categories: []
      })
      
      alert('Drive published successfully!')
      setCurrentView('browse')
    } catch (error) {
      alert('Failed to publish drive: ' + error.message)
    }
  }

  if (!isAdmin) {
    return (
      <div>
        <div className="view-header">
          <h1 className="view-title">Publish Drive</h1>
          <p className="view-description">Share your files with the network</p>
        </div>
        <div className="error-state">
          <p>You need admin permissions to publish drives.</p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="view-header">
        <h1 className="view-title">Publish Drive</h1>
        <p className="view-description">Share your files with the network</p>
      </div>
      
      <div className="form-group">
        <label className="form-label">Drive Name</label>
        <input 
          type="text" 
          className="form-input" 
          value={driveName}
          onChange={(e) => setDriveName(e.target.value)}
          placeholder="My Awesome Collection"
        />
      </div>
      
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea 
          className="form-textarea" 
          value={driveDescription}
          onChange={(e) => setDriveDescription(e.target.value)}
          placeholder="Describe your collection..."
        />
      </div>
      
      <div className="form-group">
        <label className="form-label">Tags (comma separated)</label>
        <input 
          type="text" 
          className="form-input" 
          value={driveTags}
          onChange={(e) => setDriveTags(e.target.value)}
          placeholder="movies, 1080p, action"
        />
      </div>
      
      <button className="btn" onClick={handleUploadFiles}>Upload Files</button>
      
      <div id="file-list" style={{ marginTop: '20px' }}></div>
      
      <button className="btn" onClick={handlePublishDrive} style={{ marginTop: '20px' }}>
        Publish Drive
      </button>
    </div>
  )
}

export default PublishView