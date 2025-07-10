// app.js
import { HyperShareNetwork } from './src/network.js';

window.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Initializing HyperShare network...');
    const hyperShare = new HyperShareNetwork();
    await hyperShare.init();

    if (globalThis.window) {
      window.hyperShare = hyperShare;
      console.log('HyperShare assigned to window.hyperShare');
    }

    Pear.updates(() => Pear.reload());
    console.log('HyperShare network ready');
  } catch (error) {
    console.error('Failed to initialize HyperShare:', error);
  }
});
