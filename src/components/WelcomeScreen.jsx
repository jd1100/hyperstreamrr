import React from 'react'
import { useNetwork } from '../contexts/NetworkContext'
import { useUI } from '../contexts/UIContext'

const WelcomeScreen = () => {
  const { openModal } = useUI()

  const handleCreateNetwork = () => {
    openModal('create-network')
  }

  const handleJoinNetwork = () => {
    openModal('join-network')
  }

  return (
    <div id="welcome-screen" style={{ display: 'flex' }}>
      <div className="welcome-container">
        <div className="logo">⚡ HyperShare</div>
        <p className="tagline">Decentralized file sharing networks with curated content</p>
        
        <div className="welcome-options">
          <div className="option-card" onClick={handleCreateNetwork}>
            <h3>Create Network</h3>
            <p>Start a new file sharing network as the founder admin</p>
          </div>
          
          <div className="option-card" onClick={handleJoinNetwork}>
            <h3>Join Network</h3>
            <p>Connect to an existing network with an invite code</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WelcomeScreen