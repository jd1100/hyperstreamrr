import { useState, useCallback } from 'react'

export const useFileUpload = () => {
  const [uploadProgress, setUploadProgress] = useState({})
  const [isUploading, setIsUploading] = useState(false)

  const formatBytes = useCallback((bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }, [])

  const formatTime = useCallback((seconds) => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h`
  }, [])

  const uploadFileStreaming = useCallback(async (file, filePath, progressCallback) => {
    if (!window.hyperShare) throw new Error('HyperShare not initialized')

    // Adaptive chunk size based on file size
    let CHUNK_SIZE
    if (file.size > 1024 * 1024 * 1024) { // >1GB files
      CHUNK_SIZE = 2 * 1024 * 1024 // 2MB chunks
    } else if (file.size > 100 * 1024 * 1024) { // >100MB files  
      CHUNK_SIZE = 1024 * 1024 // 1MB chunks
    } else {
      CHUNK_SIZE = 256 * 1024 // 256KB chunks
    }
    
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
    const PARALLEL_UPLOADS = 3 // Process 3 chunks in parallel
    
    console.log(`Streaming upload: ${file.name}, ${formatBytes(file.size)}, ${totalChunks} chunks of ${formatBytes(CHUNK_SIZE)}`)
    
    // Create write stream
    const writeStream = window.hyperShare.createFileUploadStream(filePath)
    
    return new Promise((resolve, reject) => {
      let chunksProcessed = 0
      let bytesUploaded = 0
      let currentChunkIndex = 0
      
      const processChunk = async (chunkIndex) => {
        try {
          const start = chunkIndex * CHUNK_SIZE
          const end = Math.min(start + CHUNK_SIZE, file.size)
          const chunk = file.slice(start, end)
          
          // Read chunk as arrayBuffer with timeout
          const chunkBuffer = await Promise.race([
            chunk.arrayBuffer(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Chunk read timeout')), 30000)
            )
          ])
          
          // Write chunk (this maintains order via the stream)
          const success = writeStream.write(Buffer.from(chunkBuffer))
          
          const chunkBytes = chunkBuffer.byteLength
          bytesUploaded += chunkBytes
          chunksProcessed++
          
          // Call progress callback
          if (progressCallback) {
            progressCallback(chunkBytes)
          }
          
          // Handle backpressure
          if (!success) {
            await new Promise(resolve => writeStream.once('drain', resolve))
          }
          
          // Check if we're done
          if (chunksProcessed >= totalChunks) {
            writeStream.end()
            console.log(`Streaming upload complete: ${file.name}`)
            resolve()
            return
          }
          
          // Start next chunk if available
          if (currentChunkIndex < totalChunks) {
            const nextChunkIndex = currentChunkIndex++
            if (nextChunkIndex < totalChunks) {
              setImmediate(() => processChunk(nextChunkIndex))
            }
          }
          
        } catch (error) {
          writeStream.destroy()
          reject(new Error(`Chunk ${chunkIndex} failed: ${error.message}`))
        }
      }
      
      writeStream.on('error', (error) => {
        reject(new Error(`Write stream error: ${error.message}`))
      })
      
      // Start parallel chunk processing
      for (let i = 0; i < Math.min(PARALLEL_UPLOADS, totalChunks); i++) {
        const chunkIndex = currentChunkIndex++
        processChunk(chunkIndex)
      }
    })
  }, [formatBytes])

  const uploadFiles = useCallback(async (files, currentPath = '/', onProgress) => {
    if (!window.hyperShare) throw new Error('HyperShare not initialized')
    
    setIsUploading(true)
    setUploadProgress({})
    
    let successCount = 0
    let failedFiles = []
    let totalBytes = 0
    let uploadedBytes = 0
    let startTime = Date.now()
    
    // Calculate total size
    for (const file of files) {
      totalBytes += file.size
    }
    
    const updateOverallProgress = () => {
      if (onProgress) {
        const progress = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0
        const elapsed = (Date.now() - startTime) / 1000
        const speed = uploadedBytes / elapsed
        const eta = speed > 0 ? ((totalBytes - uploadedBytes) / speed) : 0
        
        onProgress({
          progress: Math.round(progress),
          uploadedBytes,
          totalBytes,
          speed,
          eta,
          currentFile: successCount + 1,
          totalFiles: files.length
        })
      }
    }
    
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const fileName = file.name
        
        try {
          const filePath = currentPath === '/' ? `/${fileName}` : `${currentPath}/${fileName}`
          
          // Use streaming for large files (>10MB) or if arrayBuffer fails
          const isLargeFile = file.size > 10 * 1024 * 1024 // 10MB threshold
          
          if (isLargeFile) {
            console.log(`Using streaming upload for large file: ${fileName} (${formatBytes(file.size)})`)
            await uploadFileStreaming(file, filePath, (bytes) => {
              uploadedBytes += bytes
              updateOverallProgress()
            })
          } else {
            // Try multiple methods to read smaller files
            let content
            
            try {
              // Method 1: Try arrayBuffer (most reliable for most files)
              content = await file.arrayBuffer()
            } catch (arrayBufferError) {
              console.warn(`ArrayBuffer failed for ${fileName}, trying stream method:`, arrayBufferError.message)
              
              try {
                // Method 2: Try streaming for files that can't be loaded into memory
                await uploadFileStreaming(file, filePath, (bytes) => {
                  uploadedBytes += bytes
                  updateOverallProgress()
                })
                successCount++
                continue // Skip the regular upload below
              } catch (streamError) {
                console.warn(`Stream method failed for ${fileName}, trying text method:`, streamError.message)
                
                try {
                  // Method 3: Try reading as text for text files
                  const textContent = await file.text()
                  content = new TextEncoder().encode(textContent).buffer
                } catch (textError) {
                  throw new Error(`All read methods failed: ${textError.message}`)
                }
              }
            }
            
            if (content) {
              await window.hyperShare.uploadFile(filePath, Buffer.from(content))
              uploadedBytes += file.size
              updateOverallProgress()
            }
          }
          
          successCount++
          
        } catch (fileError) {
          console.error(`Failed to upload ${fileName}:`, fileError)
          failedFiles.push({ name: fileName, error: fileError.message })
          // Still count the bytes as "processed" for progress
          uploadedBytes += file.size
          updateOverallProgress()
        }
      }
      
      return {
        success: true,
        successCount,
        failedFiles,
        totalBytes,
        elapsed: (Date.now() - startTime) / 1000
      }
      
    } catch (error) {
      throw error
    } finally {
      setIsUploading(false)
      setUploadProgress({})
    }
  }, [uploadFileStreaming, formatBytes])

  const uploadSingleFile = useCallback(async (file, filePath) => {
    if (!window.hyperShare) throw new Error('HyperShare not initialized')
    
    try {
      const content = await file.arrayBuffer()
      await window.hyperShare.uploadFile(filePath, Buffer.from(content))
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }, [])

  return {
    uploadProgress,
    isUploading,
    uploadFiles,
    uploadSingleFile,
    uploadFileStreaming,
    formatBytes,
    formatTime
  }
}

export default useFileUpload