import { useState, useCallback, useRef, useEffect } from 'react'

export const useVideoStreaming = () => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentVideo, setCurrentVideo] = useState(null)
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const mediaSourceRef = useRef(null)
  const sourceBufferRef = useRef(null)

  const getFileType = useCallback((filename) => {
    if (!filename || typeof filename !== 'string') {
      return 'application/octet-stream'
    }
    const ext = filename.split('.').pop().toLowerCase()
    const types = {
      mkv: 'video/x-matroska',
      mp4: 'video/mp4',
      avi: 'video/x-msvideo',
      webm: 'video/webm',
      mov: 'video/quicktime'
    }
    return types[ext] || 'application/octet-stream'
  }, [])

  const streamVideo = useCallback(async (driveKey, filePath, fileName) => {
    if (!window.hyperShare) {
      setError('HyperShare not initialized')
      return
    }

    try {
      setError(null)
      setCurrentVideo({ driveKey, filePath, fileName })
      
      const fileType = getFileType(fileName)
      
      if (fileType.startsWith('video/')) {
        // Use MediaSource API for efficient streaming
        if ('MediaSource' in window) {
          const mediaSource = new MediaSource()
          mediaSourceRef.current = mediaSource
          
          const videoElement = videoRef.current
          if (videoElement) {
            videoElement.src = URL.createObjectURL(mediaSource)
            
            mediaSource.addEventListener('sourceopen', async () => {
              try {
                const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')
                sourceBufferRef.current = sourceBuffer
                
                // Stream the video file
                const stream = await window.hyperShare.createFileDownloadStream(driveKey, filePath)
                const chunks = []
                
                for await (const chunk of stream) {
                  chunks.push(chunk)
                }
                
                const videoBlob = new Uint8Array(Buffer.concat(chunks))
                sourceBuffer.appendBuffer(videoBlob)
                
                sourceBuffer.addEventListener('updateend', () => {
                  if (!sourceBuffer.updating && mediaSource.readyState === 'open') {
                    mediaSource.endOfStream()
                  }
                })
                
              } catch (err) {
                console.error('MediaSource streaming error:', err)
                setError(err.message)
              }
            })
          }
        } else {
          // Fallback to blob URL for browsers without MediaSource
          const stream = await window.hyperShare.createFileDownloadStream(driveKey, filePath)
          const chunks = []
          
          for await (const chunk of stream) {
            chunks.push(chunk)
          }
          
          const blob = new Blob(chunks, { type: fileType })
          const url = URL.createObjectURL(blob)
          
          if (videoRef.current) {
            videoRef.current.src = url
          }
        }
        
        setIsPlaying(true)
      } else {
        setError('File is not a supported video format')
      }
      
    } catch (err) {
      console.error('Video streaming error:', err)
      setError(err.message)
    }
  }, [getFileType])

  const pauseVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause()
    }
    setIsPlaying(false)
  }, [])

  const playVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play()
    }
    setIsPlaying(true)
  }, [])

  const stopVideo = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ''
    }
    
    if (mediaSourceRef.current) {
      try {
        if (mediaSourceRef.current.readyState === 'open') {
          mediaSourceRef.current.endOfStream()
        }
      } catch (err) {
        console.warn('Error ending MediaSource stream:', err)
      }
      mediaSourceRef.current = null
    }
    
    sourceBufferRef.current = null
    setIsPlaying(false)
    setCurrentVideo(null)
    setError(null)
  }, [])

  const previewFile = useCallback(async (driveKey, file) => {
    if (!window.hyperShare) {
      setError('HyperShare not initialized')
      return null
    }

    try {
      setError(null)
      const fileType = getFileType(file.name)

      if (fileType.startsWith('video/')) {
        // Return video blob URL for preview
        const stream = await window.hyperShare.createFileDownloadStream(driveKey, file.path)
        const chunks = []
        
        for await (const chunk of stream) {
          chunks.push(chunk)
        }
        
        const blob = new Blob(chunks, { type: fileType })
        return {
          type: 'video',
          url: URL.createObjectURL(blob),
          fileType
        }
      } else if (fileType.startsWith('image/')) {
        // Handle image preview
        const content = await window.hyperShare.downloadFile(driveKey, file.path)
        const blob = new Blob([content], { type: fileType })
        return {
          type: 'image',
          url: URL.createObjectURL(blob),
          fileType
        }
      } else if (fileType.startsWith('text/')) {
        // Handle text preview
        const content = await window.hyperShare.downloadFile(driveKey, file.path)
        return {
          type: 'text',
          content: new TextDecoder().decode(content),
          fileType
        }
      } else {
        return {
          type: 'unsupported',
          fileType
        }
      }
    } catch (err) {
      console.error('File preview error:', err)
      setError(err.message)
      return null
    }
  }, [getFileType])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVideo()
    }
  }, [stopVideo])

  return {
    videoRef,
    isPlaying,
    currentVideo,
    error,
    streamVideo,
    pauseVideo,
    playVideo,
    stopVideo,
    previewFile,
    getFileType
  }
}

export default useVideoStreaming