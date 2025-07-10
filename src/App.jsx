import React, { useEffect, useState } from 'react'
import { NetworkProvider } from './contexts/NetworkContext'
import { UIProvider } from './contexts/UIContext'
import TitleBar from './components/TitleBar'
import WelcomeScreen from './components/WelcomeScreen'
import MainApp from './components/MainApp'
import { usePearIntegration } from './hooks/usePearIntegration'

function App() {
  const [isReady, setIsReady] = useState(false)
  const [hasNetworks, setHasNetworks] = useState(false)

  // Initialize Pear integration
  usePearIntegration()

  useEffect(() => {
    // Wait for HyperShare to be ready (from legacy app.js)
    const checkInterval = setInterval(async () => {
      if (window.hyperShare && window.hyperShare.ready) {
        clearInterval(checkInterval)
        setIsReady(true)
        
        // Check if we have existing networks
        const networks = Array.from(window.hyperShare.networks.values())
        setHasNetworks(networks.length > 0)
      }
    }, 100)

    return () => clearInterval(checkInterval)
  }, [])

  if (!isReady) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Initializing HyperShare...</p>
      </div>
    )
  }

  return (
    <NetworkProvider>
      <UIProvider>
        <div className="app">
          <TitleBar />
          {hasNetworks ? <MainApp /> : <WelcomeScreen />}
        </div>
      </UIProvider>
    </NetworkProvider>
  )
}

export default App