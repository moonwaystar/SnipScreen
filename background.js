let clickCount = 0;
let clickTimer = null;

chrome.runtime.onInstalled.addListener(async () => {
  const defaultPath = 'SnipScreen';
  await chrome.storage.sync.set({ saveLocation: defaultPath });
});

chrome.action.onClicked.addListener(async (tab) => {
  clickCount++;
  
  if (clickCount === 1) {
    clickTimer = setTimeout(async () => {
      try {
        const screenshotUrl = await chrome.tabs.captureVisibleTab(null, {
          format: 'png',
          quality: 100
        });
        
        chrome.tabs.create({
          url: 'editor.html',
          active: true
        }, (newTab) => {
          chrome.storage.local.set({ 
            currentScreenshot: screenshotUrl,
            originalTab: tab.id
          });
        });
      } catch (error) {
        console.error('Screenshot failed:', error);
      }
      clickCount = 0;
    }, 300);
  } else {
    clearTimeout(clickTimer);
    try {
      // Capture only the visible tab content
      const screenshotUrl = await chrome.tabs.captureVisibleTab(null, {
        format: 'png',
        quality: 100
      });
      
      const { saveLocation } = await chrome.storage.sync.get(['saveLocation']);
      
      await chrome.downloads.download({
        url: screenshotUrl,
        filename: `${saveLocation}/screenshot-${Date.now()}.png`,
        saveAs: false
      });
    } catch (error) {
      console.error('Screenshot failed:', error);
    }
    clickCount = 0;
  }
});