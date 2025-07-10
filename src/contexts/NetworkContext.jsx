import React, { createContext, useContext, useState, useEffect } from 'react'

const NetworkContext = createContext({
  networks: new Map(),
  activeNetwork: null,
  isConnected: false,
  peers: [],
  stats: null,
  setActiveNetwork: () => {},
  refreshNetworks: () => {},
  createNetwork: () => {},
  joinNetwork: () => {},
  leaveNetwork: () => {}
})

export const useNetwork = () => {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider')
  }
  return context
}

export const NetworkProvider = ({ children }) => {
  const [networks, setNetworks] = useState(new Map())
  const [activeNetwork, setActiveNetwork] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [peers, setPeers] = useState([])
  const [stats, setStats] = useState(null)

  // Sync with legacy HyperShare state
  useEffect(() => {
    if (!window.hyperShare) return

    const updateNetworks = () => {
      setNetworks(new Map(window.hyperShare.networks))
      if (window.hyperShare.activeNetwork) {
        setActiveNetwork(window.hyperShare.activeNetwork)
        setIsConnected(!!window.hyperShare.activeNetwork.swarm?.connections?.size)
      }
    }

    // Listen for role updates from legacy code
    const handleRoleUpdate = (event) => {
      console.log('Role update received in React context:', event.detail)
      if (activeNetwork && event.detail.role) {
        setActiveNetwork(prev => ({
          ...prev,
          role: event.detail.role,
          adminKeypair: window.hyperShare.activeNetwork?.adminKeypair
        }))
      }
    }

    window.addEventListener('role-updated', handleRoleUpdate)
    
    // Initial sync
    updateNetworks()

    // Set up periodic sync
    const syncInterval = setInterval(updateNetworks, 2000)

    return () => {
      window.removeEventListener('role-updated', handleRoleUpdate)
      clearInterval(syncInterval)
    }
  }, [activeNetwork])

  // Update stats periodically
  useEffect(() => {
    if (!window.hyperShare || !activeNetwork) return

    const updateStats = async () => {
      try {
        const networkStats = await window.hyperShare.getNetworkStats()
        setStats(networkStats)
        
        if (networkStats.swarm?.connections) {
          setPeers(Array.from(networkStats.swarm.connections.values()))
          setIsConnected(networkStats.swarm.connections.size > 0)
        }
      } catch (error) {
        console.error('Failed to update stats:', error)
      }
    }

    updateStats()
    const statsInterval = setInterval(updateStats, 2000)

    return () => clearInterval(statsInterval)
  }, [activeNetwork])

  const refreshNetworks = () => {
    if (window.hyperShare) {
      setNetworks(new Map(window.hyperShare.networks))
    }
  }

  const createNetwork = async (name, description) => {
    if (!window.hyperShare) throw new Error('HyperShare not initialized')
    
    const result = await window.hyperShare.createNetwork(name, description)
    setNetworks(new Map(window.hyperShare.networks))
    setActiveNetwork(result.network)
    return result
  }

  const joinNetwork = async (inviteCode) => {
    if (!window.hyperShare) throw new Error('HyperShare not initialized')
    
    const network = await window.hyperShare.joinNetwork(inviteCode)
    setNetworks(new Map(window.hyperShare.networks))
    setActiveNetwork(network)
    return network
  }

  const leaveNetwork = async (networkKey) => {
    if (!window.hyperShare) throw new Error('HyperShare not initialized')
    
    const nextNetwork = await window.hyperShare.leaveNetwork(networkKey)
    setNetworks(new Map(window.hyperShare.networks))
    setActiveNetwork(nextNetwork)
    return nextNetwork
  }

  const switchNetwork = async (networkKey) => {
    const network = networks.get(networkKey)
    if (network) {
      window.hyperShare.activeNetwork = network
      setActiveNetwork(network)
    }
  }

  const value = {
    networks,
    activeNetwork,
    isConnected,
    peers,
    stats,
    setActiveNetwork: switchNetwork,
    refreshNetworks,
    createNetwork,
    joinNetwork,
    leaveNetwork
  }

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  )
}

export default NetworkContext