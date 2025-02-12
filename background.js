function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

chrome.runtime.onInstalled.addListener(async () => {
  const defaultPath = 'SnipScreen';
  await chrome.storage.sync.set({ saveLocation: defaultPath });
});

const handleScreenshot = debounce(async (tab) => {
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
    showNotification(`Screenshot failed: ${error.message}`);
  }
}, 250);

chrome.action.onClicked.addListener(handleScreenshot);

function showNotification(message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'SnipScreen',
    message: message
  });
}