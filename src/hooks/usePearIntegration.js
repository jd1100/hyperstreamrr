import { useEffect } from 'react'

export const usePearIntegration = () => {
  useEffect(() => {
    if (typeof Pear !== 'undefined') {
      // Set up Pear lifecycle hooks
      Pear.teardown(() => {
        // Cleanup P2P connections when app closes
        if (window.hyperShare) {
          console.log('Cleaning up HyperShare connections...')
          // The cleanup will be handled by the legacy app.js teardown logic
        }
      })

      // Set up title bar controls
      const setupTitleBarControls = () => {
        const self = Pear.Window.self

        const closeBtn = document.getElementById('close-btn')
        const minimizeBtn = document.getElementById('minimize-btn')
        const maximizeBtn = document.getElementById('maximize-btn')

        if (closeBtn) closeBtn.addEventListener('click', () => self.close())
        if (minimizeBtn) minimizeBtn.addEventListener('click', () => self.minimize())
        if (maximizeBtn) maximizeBtn.addEventListener('click', () => self.maximize())
      }

      // Set up controls when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupTitleBarControls)
      } else {
        setupTitleBarControls()
      }
    }
  }, [])
}

export default usePearIntegration