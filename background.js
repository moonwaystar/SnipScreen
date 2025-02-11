chrome.runtime.onInstalled.addListener(async () => {
  const defaultPath = 'SnipScreen';
  await chrome.storage.sync.set({ saveLocation: defaultPath });
});

chrome.action.onClicked.addListener(async (tab) => {
    try {
      const { saveLocation } = await chrome.storage.sync.get(['saveLocation']);
      const screenshotUrl = await chrome.tabs.captureVisibleTab();
      
      await chrome.downloads.download({
        url: screenshotUrl,
        filename: `${saveLocation}/screenshot-${Date.now()}.png`,
        saveAs: false
      });
    } catch (error) {
      console.error('Screenshot failed:', error);
    }
  });