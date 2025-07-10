import React from 'react'
import NetworksBar from './NetworksBar'
import NavigationSidebar from './NavigationSidebar'
import MainContent from './MainContent'

const AppLayout = () => {
  return (
    <div className="app-layout">
      <NetworksBar />
      <NavigationSidebar />
      <MainContent />
    </div>
  )
}

export default AppLayout