import React from 'react'
import { useUI } from '../contexts/UIContext'
import BrowseView from './views/BrowseView'
import PublishView from './views/PublishView'
import MyDrivesView from './views/MyDrivesView'

const ContentArea = () => {
  const { currentView } = useUI()

  const renderView = () => {
    switch (currentView) {
      case 'browse':
        return <BrowseView />
      case 'publish':
        return <PublishView />
      case 'my-drives':
        return <MyDrivesView />
      case 'categories':
      case 'verified':
      case 'downloads':
      case 'manage-admins':
        return (
          <div className="loading">
            <div className="spinner"></div>
            <p>View coming soon...</p>
          </div>
        )
      default:
        return <BrowseView />
    }
  }

  return (
    <div className="content-area" id="content-area">
      {renderView()}
    </div>
  )
}

export default ContentArea