import { useState, useEffect, useCallback } from 'react'

export const useHyperShareNetwork = () => {
  const [isReady, setIsReady] = useState(false)
  const [networks, setNetworks] = useState(new Map())
  const [activeNetwork, setActiveNetwork] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Wait for HyperShare to be ready
    const checkInterval = setInterval(() => {
      if (window.hyperShare && window.hyperShare.ready) {
        clearInterval(checkInterval)
        setIsReady(true)
        
        // Initialize networks
        setNetworks(new Map(window.hyperShare.networks))
        if (window.hyperShare.activeNetwork) {
          setActiveNetwork(window.hyperShare.activeNetwork)
        }
      }
    }, 100)

    return () => clearInterval(checkInterval)
  }, [])

  const createNetwork = useCallback(async (name, description) => {
    if (!window.hyperShare) throw new Error('HyperShare not initialized')
    
    try {
      const result = await window.hyperShare.createNetwork(name, description)
      setNetworks(new Map(window.hyperShare.networks))
      setActiveNetwork(result.network)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    }
  }, [])

  const joinNetwork = useCallback(async (inviteCode) => {
    if (!window.hyperShare) throw new Error('HyperShare not initialized')
    
    try {
      const network = await window.hyperShare.joinNetwork(inviteCode)
      setNetworks(new Map(window.hyperShare.networks))
      setActiveNetwork(network)
      return network
    } catch (err) {
      setError(err.message)
      throw err
    }
  }, [])

  const leaveNetwork = useCallback(async (networkKey) => {
    if (!window.hyperShare) throw new Error('HyperShare not initialized')
    
    try {
      const nextNetwork = await window.hyperShare.leaveNetwork(networkKey)
      setNetworks(new Map(window.hyperShare.networks))
      setActiveNetwork(nextNetwork)
      return nextNetwork
    } catch (err) {
      setError(err.message)
      throw err
    }
  }, [])

  const switchNetwork = useCallback(async (networkKey) => {
    const network = networks.get(networkKey)
    if (network && window.hyperShare) {
      window.hyperShare.activeNetwork = network
      setActiveNetwork(network)
    }
  }, [networks])

  return {
    isReady,
    networks,
    activeNetwork,
    error,
    createNetwork,
    joinNetwork,
    leaveNetwork,
    switchNetwork
  }
}

export default useHyperShareNetwork