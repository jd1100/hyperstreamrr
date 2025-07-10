import { useState, useCallback, useEffect } from 'react'

export const useDriveSync = () => {
  const [drives, setDrives] = useState([])
  const [myDrives, setMyDrives] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [syncStatus, setSyncStatus] = useState('idle') // 'idle', 'syncing', 'synced', 'error'

  const browseDrives = useCallback(async () => {
    if (!window.hyperShare) {
      setError('HyperShare not initialized')
      return []
    }

    try {
      setLoading(true)
      setError(null)
      setSyncStatus('syncing')
      
      const driveList = await window.hyperShare.browseDrives()
      setDrives(driveList)
      setSyncStatus('synced')
      
      return driveList
    } catch (err) {
      console.error('Error browsing drives:', err)
      setError(err.message)
      setSyncStatus('error')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const getMyDrives = useCallback(async () => {
    if (!window.hyperShare) {
      setError('HyperShare not initialized')
      return []
    }

    try {
      setLoading(true)
      setError(null)
      
      const myDriveList = await window.hyperShare.getMyDrives()
      setMyDrives(myDriveList)
      
      return myDriveList
    } catch (err) {
      console.error('Error getting my drives:', err)
      setError(err.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  const browseFiles = useCallback(async (driveKey, path = '/') => {
    if (!window.hyperShare) {
      throw new Error('HyperShare not initialized')
    }

    try {
      setError(null)
      const files = await window.hyperShare.browseFiles(driveKey, path)
      return files
    } catch (err) {
      console.error('Error browsing files:', err)
      setError(err.message)
      throw err
    }
  }, [])

  const publishDrive = useCallback(async (driveInfo) => {
    if (!window.hyperShare) {
      throw new Error('HyperShare not initialized')
    }

    try {
      setError(null)
      await window.hyperShare.publishDrive(driveInfo)
      
      // Refresh drives list
      await browseDrives()
      await getMyDrives()
      
      return { success: true }
    } catch (err) {
      console.error('Error publishing drive:', err)
      setError(err.message)
      throw err
    }
  }, [browseDrives, getMyDrives])

  const unpublishDrive = useCallback(async (driveKey) => {
    if (!window.hyperShare) {
      throw new Error('HyperShare not initialized')
    }

    try {
      setError(null)
      await window.hyperShare.unpublishDrive(driveKey)
      
      // Refresh drives list
      await browseDrives()
      await getMyDrives()
      
      return { success: true }
    } catch (err) {
      console.error('Error unpublishing drive:', err)
      setError(err.message)
      throw err
    }
  }, [browseDrives, getMyDrives])

  const verifyDrive = useCallback(async (driveKey) => {
    if (!window.hyperShare) {
      throw new Error('HyperShare not initialized')
    }

    try {
      setError(null)
      await window.hyperShare.verifyDrive(driveKey)
      
      // Refresh drives list
      await browseDrives()
      
      return { success: true }
    } catch (err) {
      console.error('Error verifying drive:', err)
      setError(err.message)
      throw err
    }
  }, [browseDrives])

  const downloadFile = useCallback(async (driveKey, filePath) => {
    if (!window.hyperShare) {
      throw new Error('HyperShare not initialized')
    }

    try {
      setError(null)
      const content = await window.hyperShare.downloadFile(driveKey, filePath)
      
      // Create download link
      const blob = new Blob([content])
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filePath.split('/').pop()
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      return { success: true }
    } catch (err) {
      console.error('Error downloading file:', err)
      setError(err.message)
      throw err
    }
  }, [])

  const searchFiles = useCallback(async (query) => {
    if (!window.hyperShare) {
      throw new Error('HyperShare not initialized')
    }

    try {
      setError(null)
      const results = await window.hyperShare.searchFiles(query)
      return results
    } catch (err) {
      console.error('Error searching files:', err)
      setError(err.message)
      throw err
    }
  }, [])

  const deleteFile = useCallback(async (driveKey, filePath) => {
    if (!window.hyperShare) {
      throw new Error('HyperShare not initialized')
    }

    try {
      setError(null)
      await window.hyperShare.deleteFile(driveKey, filePath)
      return { success: true }
    } catch (err) {
      console.error('Error deleting file:', err)
      setError(err.message)
      throw err
    }
  }, [])

  const createFolder = useCallback(async (driveKey, folderPath) => {
    if (!window.hyperShare) {
      throw new Error('HyperShare not initialized')
    }

    try {
      setError(null)
      // Create an empty file in the folder to create the directory structure
      await window.hyperShare.uploadFile(`${folderPath}/.gitkeep`, Buffer.from(''))
      return { success: true }
    } catch (err) {
      console.error('Error creating folder:', err)
      setError(err.message)
      throw err
    }
  }, [])

  // Utility function to format bytes
  const formatBytes = useCallback((bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }, [])

  // Auto-refresh drives periodically
  useEffect(() => {
    if (window.hyperShare && window.hyperShare.ready) {
      const refreshInterval = setInterval(() => {
        browseDrives()
      }, 30000) // Refresh every 30 seconds

      return () => clearInterval(refreshInterval)
    }
  }, [browseDrives])

  return {
    drives,
    myDrives,
    loading,
    error,
    syncStatus,
    browseDrives,
    getMyDrives,
    browseFiles,
    publishDrive,
    unpublishDrive,
    verifyDrive,
    downloadFile,
    searchFiles,
    deleteFile,
    createFolder,
    formatBytes
  }
}

export default useDriveSync