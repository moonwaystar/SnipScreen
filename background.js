let clickCount = 0;
let clickTimeout;

const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.storage.sync.set({ saveLocation: 'SnipScreen' });
    await chrome.storage.local.set({ sessionActive: true });
    showNotification('SnipScreen installed successfully', 'success');
  } catch (error) {
    console.error('Installation failed:', error);
    showNotification('Failed to initialize extension: ' + error.message, 'error');
  }
});

chrome.runtime.onSuspend.addListener(async () => {
  try {
    await chrome.storage.local.remove(['currentScreenshot', 'originalTab', 'cropOnlyMode']);
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
});

async function handleClick(tab) {
  clickCount++;
  
  if (clickCount === 1) {
    clickTimeout = setTimeout(async () => {
      await handleScreenshot(tab, true);
      clickCount = 0;
    }, 200);
  } else if (clickCount === 2) {
    clearTimeout(clickTimeout);
    await handleScreenshot(tab, false);
    clickCount = 0;
  }
}

const handleScreenshot = debounce(async (tab, cropOnly = false) => {
  try {
    if (!tab?.id) throw new Error('No active tab found');
    
    const screenshotUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 100
    });
    
    if (!screenshotUrl) throw new Error('Empty screenshot captured');
    
    const newTab = await new Promise((resolve) => {
      chrome.tabs.create({
        url: 'editor.html',
        active: true
      }, resolve);
    });
    
    await chrome.storage.local.set({ 
      currentScreenshot: screenshotUrl,
      originalTab: tab.id,
      cropOnlyMode: cropOnly
    });
    
    showNotification('Screenshot captured successfully', 'success');
  } catch (error) {
    console.error('Screenshot failed:', error);
    showNotification(`Screenshot failed: ${error.message || 'Unknown error'}`, 'error');
    await chrome.storage.local.remove(['currentScreenshot', 'originalTab', 'cropOnlyMode']);
  }
}, 200);

chrome.action.onClicked.addListener(handleClick);

function showNotification(message, type = 'basic') {
  const options = {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'SnipScreen',
    message,
    priority: type === 'error' ? 2 : 0,
    requireInteraction: type === 'error'
  };
  
  chrome.notifications.create(options);
}