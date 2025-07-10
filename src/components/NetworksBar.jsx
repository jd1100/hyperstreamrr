import React from 'react'
import { useNetwork } from '../contexts/NetworkContext'
import { useUI } from '../contexts/UIContext'

const NetworksBar = () => {
  const { networks, activeNetwork, setActiveNetwork } = useNetwork()
  const { openModal } = useUI()

  const handleNetworkClick = (networkKey) => {
    setActiveNetwork(networkKey)
  }

  const handleAddNetwork = () => {
    openModal('welcome-screen')
  }

  const networkArray = Array.from(networks.values())

  return (
    <div className="networks-bar">
      <div id="network-list">
        {networkArray.map((network) => (
          <div
            key={network.key}
            className={`network-icon ${activeNetwork?.key === network.key ? 'active' : ''}`}
            onClick={() => handleNetworkClick(network.key)}
            title={network.name}
          >
            {network.name.substring(0, 2).toUpperCase()}
            {activeNetwork?.key === network.key && <div className="peer-indicator"></div>}
          </div>
        ))}
      </div>
      <div className="network-divider"></div>
      <div className="network-icon add" onClick={handleAddNetwork}>+</div>
    </div>
  )
}

export default NetworksBar