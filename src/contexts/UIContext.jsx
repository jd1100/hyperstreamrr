import React, { createContext, useContext, useState } from 'react'

const UIContext = createContext({
  // Modal states
  modalState: {},
  openModal: () => {},
  closeModal: () => {},
  closeAllModals: () => {},
  
  // Loading states
  loading: {},
  setLoading: () => {},
  
  // View states
  currentView: 'browse',
  setCurrentView: () => {},
  
  // File browser state
  fileBrowserState: {
    viewMode: 'list',
    sortBy: 'name',
    sortOrder: 'asc',
    searchTerm: '',
    currentPath: '/',
    currentDriveKey: '',
    currentDriveName: ''
  },
  updateFileBrowserState: () => {},
  
  // Upload progress
  uploadProgress: {},
  setUploadProgress: () => {}
})

export const useUI = () => {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUI must be used within a UIProvider')
  }
  return context
}

export const UIProvider = ({ children }) => {
  const [modalState, setModalState] = useState({})
  const [loading, setLoadingState] = useState({})
  const [currentView, setCurrentView] = useState('browse')
  const [fileBrowserState, setFileBrowserState] = useState({
    viewMode: 'list',
    sortBy: 'name',
    sortOrder: 'asc',
    searchTerm: '',
    currentPath: '/',
    currentDriveKey: '',
    currentDriveName: ''
  })
  const [uploadProgress, setUploadProgress] = useState({})

  const openModal = (modalId, data = {}) => {
    setModalState(prev => ({
      ...prev,
      [modalId]: { isOpen: true, data }
    }))
  }

  const closeModal = (modalId) => {
    setModalState(prev => ({
      ...prev,
      [modalId]: { isOpen: false, data: {} }
    }))
  }

  const closeAllModals = () => {
    setModalState({})
  }

  const setLoading = (key, isLoading) => {
    setLoadingState(prev => ({
      ...prev,
      [key]: isLoading
    }))
  }

  const updateFileBrowserState = (updates) => {
    setFileBrowserState(prev => ({
      ...prev,
      ...updates
    }))
  }

  const value = {
    modalState,
    openModal,
    closeModal,
    closeAllModals,
    loading,
    setLoading,
    currentView,
    setCurrentView,
    fileBrowserState,
    updateFileBrowserState,
    uploadProgress,
    setUploadProgress
  }

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  )
}

export default UIContext