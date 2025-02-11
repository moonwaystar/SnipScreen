async function captureScreen() {
    try {
      const result = await chrome.storage.sync.get(['saveLocation']);
      const saveLocation = result.saveLocation || 'SnipScreen';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const screenshotUrl = await chrome.tabs.captureVisibleTab();
      
      await chrome.downloads.download({
        url: screenshotUrl,
        filename: `${saveLocation}/screenshot-${timestamp}.png`,
        saveAs: false
      });
    } catch (error) {
      console.error('Screenshot capture failed:', error);
    }
  }
  
  captureScreen().catch(console.error);