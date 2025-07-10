import React, { useState } from 'react'
import { useNetwork } from '../contexts/NetworkContext'

const TopBar = () => {
  const { stats } = useNetwork()
  const [searchTerm, setSearchTerm] = useState('')

  const handleSearch = async (e) => {
    if (e.key === 'Enter' && searchTerm.trim()) {
      // TODO: Implement search functionality
      if (window.hyperShare) {
        const results = await window.hyperShare.searchFiles(searchTerm.trim())
        console.log('Search results:', results)
        // This will be handled by the ContentArea component in a future update
      }
    }
  }

  const handleFilters = () => {
    alert('Filters coming soon!')
  }

  return (
    <div className="top-bar">
      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search files across the network..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={handleSearch}
        />
      </div>
      
      <button className="filter-button" onClick={handleFilters}>
        <span>⚙️</span> Filters
      </button>

      <div className="stats-bar">
        <div className="stat">
          <div className="stat-value">{stats?.peers || 0}</div>
          <div className="stat-label">Peers</div>
        </div>
        <div className="stat">
          <div className="stat-value">{stats?.drives || 0}</div>
          <div className="stat-label">Drives</div>
        </div>
      </div>
    </div>
  )
}

export default TopBar