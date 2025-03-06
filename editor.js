class ScreenshotEditor {
  constructor() {
    this.canvas = document.getElementById('editorCanvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    this.activeTools = new Set();
    this.isDrawing = false;
    this.cropStart = null;
    this.cropEnd = null;
    this.currentImageData = null;
    this.maxCanvasSize = { width: 1920, height: 1080 };
    this.cropOnlyMode = false;
    this.toastElement = document.createElement('div');
    this.toastElement.className = 'toast';
    document.body.appendChild(this.toastElement);
    
    try {
      this.checkMode();
      this.initializeTools();
      this.loadScreenshot();
      this.setupEventListeners();
      window.addEventListener('beforeunload', () => this.cleanup());
    } catch (error) {
      console.error('Editor initialization failed:', error);
      this.showToast(`Editor setup failed: ${error.message}`, false, 'error');
    }
    
    this.throttledDrawCropGuides = this.throttle((pos) => {
      const width = pos.x - this.cropStart.x;
      const height = pos.y - this.cropStart.y;
      const startX = Math.min(this.cropStart.x, pos.x);
      const startY = Math.min(this.cropStart.y, pos.y);
      this.drawCropGuides(startX, startY, Math.abs(width), Math.abs(height));
    }, 60); // Increased from 32ms to 60ms
  }

  throttle(func, limit) {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= limit) {
        lastCall = now;
        func.apply(this, args);
      }
    };
  }

  cleanup() {
    try {
      chrome.storage.local.remove(['currentScreenshot', 'originalTab', 'cropOnlyMode'], () => {
        console.log('Temporary data cleared');
      });
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
    this.ctx = null;
    this.canvas = null;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    this.originalImage = null;
    this.currentImageData = null;
    this.toastElement.remove();
  }

  async checkMode() {
    const { cropOnlyMode } = await chrome.storage.local.get(['cropOnlyMode']);
    this.cropOnlyMode = cropOnlyMode || false;
    
    if (this.cropOnlyMode) {
      document.querySelectorAll('.tool-item:not(#cropTool)').forEach(tool => {
        tool.style.display = 'none';
      });
      this.activeTools.add('crop');
      document.getElementById('cropTool').classList.add('active');
    } else {
      document.getElementById('cropTool').style.display = 'flex';
    }
  }

  async loadScreenshot() {
    try {
      const { currentScreenshot } = await chrome.storage.local.get(['currentScreenshot']);
      if (!currentScreenshot) throw new Error('No screenshot data available');
      
      const img = new Image();
      img.onerror = () => {
        throw new Error('Failed to load screenshot image');
      };
      img.onload = () => {
        try {
          let { width, height } = img;
          
          if (width > this.maxCanvasSize.width || height > this.maxCanvasSize.height) {
            const ratio = Math.min(this.maxCanvasSize.width / width, this.maxCanvasSize.height / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }
          
          this.canvas.width = width;
          this.canvas.height = height;
          this.offscreenCanvas.width = width;
          this.offscreenCanvas.height = height;
          this.canvas.style.maxWidth = '100%';
          this.canvas.style.maxHeight = 'calc(100vh - 80px)';
          this.canvas.style.width = 'auto';
          this.canvas.style.height = 'auto';
          this.canvas.style.cursor = 'default';
          
          this.offscreenCtx.drawImage(img, 0, 0, width, height);
          this.ctx.drawImage(this.offscreenCanvas, 0, 0);
          this.originalImage = img;
          this.currentImageData = this.offscreenCtx.getImageData(0, 0, width, height);
          this.canvas.style.opacity = '0';
          requestAnimationFrame(() => {
            this.canvas.style.transition = 'opacity 0.3s ease-in-out';
            this.canvas.style.opacity = '1';
          });
        } catch (error) {
          throw new Error(`Canvas setup failed: ${error.message}`);
        }
      };
      img.src = currentScreenshot;
    } catch (error) {
      console.error('Failed to load screenshot:', error);
      this.showToast(`Failed to load screenshot: ${error.message}`, false, 'error');
      this.handleLoadFailure();
    }
  }

  handleLoadFailure() {
    this.canvas.width = 400;
    this.canvas.height = 300;
    this.offscreenCanvas.width = 400;
    this.offscreenCanvas.height = 300;
    this.ctx.fillStyle = '#FAFAFA';
    this.ctx.fillRect(0, 0, 400, 300);
    this.ctx.fillStyle = '#FF0000';
    this.ctx.font = '16px sans-serif';
    this.ctx.fillText('Screenshot loading failed', 20, 150);
    chrome.storage.local.remove(['currentScreenshot']);
  }

  initializeTools() {
    const tools = {
      'cropTool': 'crop',
      'annotateTool': 'annotate',
      'shareTool': this.copyToClipboard.bind(this),
      'saveTool': this.saveImage.bind(this)
    };
    
    for (const [id, action] of Object.entries(tools)) {
      const tool = document.getElementById(id);
      tool.addEventListener('click', () => {
        try {
          if (typeof action === 'string') {
            this.toggleTool(action);
          } else {
            action();
          }
        } catch (error) {
          console.error(`Tool ${id} failed:`, error);
          this.showToast(`Tool error: ${error.message}`, false, 'error');
        }
      });
    }
  }

  toggleTool(tool) {
    if (this.cropOnlyMode) return;
    
    const toolElement = document.getElementById(`${tool}Tool`);
    if (!toolElement || toolElement.style.display === 'none') return;
    
    const otherTool = tool === 'crop' ? 'annotate' : 'crop';
    const otherToolElement = document.getElementById(`${otherTool}Tool`);
    
    if (this.activeTools.has(tool)) {
      this.activeTools.delete(tool);
      toolElement.classList.remove('active');
      if (tool === 'crop' && this.currentImageData) {
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);
        this.canvas.style.cursor = 'default';
      }
    } else {
      if (this.activeTools.has(otherTool)) {
        this.activeTools.delete(otherTool);
        otherToolElement.classList.remove('active');
        this.currentImageData = this.offscreenCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      }
      
      this.activeTools.add(tool);
      toolElement.classList.add('active');
      if (tool === 'crop') {
        this.canvas.style.cursor = 'crosshair';
      }
    }
  }

  async completeCrop() {
    if (this.cropStart && this.cropEnd) {
      const width = Math.abs(this.cropEnd.x - this.cropStart.x);
      const height = Math.abs(this.cropEnd.y - this.cropStart.y);
      const startX = Math.min(this.cropStart.x, this.cropEnd.x);
      const startY = Math.min(this.cropStart.y, this.cropEnd.y);

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      tempCanvas.width = this.canvas.width;
      tempCanvas.height = this.canvas.height;
      tempCtx.drawImage(this.offscreenCanvas, 0, 0);

      this.canvas.width = width;
      this.canvas.height = height;
      this.offscreenCanvas.width = width;
      this.offscreenCanvas.height = height;
      this.ctx.imageSmoothingEnabled = false;
      this.offscreenCtx.imageSmoothingEnabled = false;
      this.offscreenCtx.drawImage(tempCanvas, startX, startY, width, height, 0, 0, width, height);
      this.ctx.drawImage(this.offscreenCanvas, 0, 0);
      this.currentImageData = this.offscreenCtx.getImageData(0, 0, width, height);

      if (this.cropOnlyMode) {
        document.querySelectorAll('.tool-item').forEach(tool => {
          tool.style.display = 'flex';
        });
        document.getElementById('cropTool').style.display = 'none';
        
        this.cropOnlyMode = false;
        await chrome.storage.local.set({ cropOnlyMode: false });
        this.activeTools.clear();
        this.cropStart = null;
        this.cropEnd = null;
        this.isDrawing = false;

        this.canvas.style.cursor = 'default';
        this.showSpinner(false);
        this.showToast('Crop completed', false, 'success');
      }
    }
  }

  showSpinner(show) {
    const spinner = document.getElementById('spinner');
    if (spinner) {
      spinner.style.display = show ? 'flex' : 'none';
    }
  }

  async copyToClipboard() {
    try {
      const { clipboardEnabled } = await chrome.storage.sync.get({ clipboardEnabled: true });
      if (!clipboardEnabled) throw new Error('Clipboard feature disabled');
      
      if (!this.currentImageData) throw new Error('No image to copy');
      
      if (!navigator.clipboard) throw new Error('Clipboard API not supported in this browser');
      const permission = await navigator.permissions.query({ name: 'clipboard-write' });
      if (permission.state === 'denied') {
        throw new Error('Clipboard permission denied. Please enable it in browser settings.');
      }

      this.showSpinner(true);
      this.showToast('Copying to clipboard...', true);
      
      const finalCanvas = this.prepareFinalCanvas();
      const dataUrl = finalCanvas.toDataURL('image/png', 1.0);
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);

      this.showToast('Screenshot copied to clipboard!', false, 'success');
      await chrome.storage.local.remove('currentScreenshot');
    } catch (error) {
      console.error('Copy failed:', error);
      this.showToast(`Failed to copy: ${error.message || 'Unknown error'}`, false, 'error');
      this.activeTools.clear();
      document.querySelectorAll('.tool-item').forEach(item => item.classList.remove('active'));
      if (error.message.includes('Clipboard')) this.offerManualCopyFallback();
    } finally {
      this.showSpinner(false);
    }
  }

  prepareFinalCanvas() {
    const finalCanvas = document.createElement('canvas');
    const finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
    if (this.cropStart && this.cropEnd && this.activeTools.has('crop')) {
      const width = Math.abs(this.cropEnd.x - this.cropEnd.x);
      const height = Math.abs(this.cropEnd.y - this.cropEnd.y);
      const startX = Math.max(0, Math.min(this.cropStart.x, this.cropEnd.x));
      const startY = Math.max(0, Math.min(this.cropStart.y, this.cropEnd.y));
      finalCanvas.width = Math.min(width, this.canvas.width - startX);
      finalCanvas.height = Math.min(height, this.canvas.height - startY);
      finalCtx.imageSmoothingEnabled = false;
      finalCtx.drawImage(this.offscreenCanvas, startX, startY, finalCanvas.width, finalCanvas.height, 0, 0, finalCanvas.width, finalCanvas.height);
    } else {
      finalCanvas.width = this.canvas.width;
      finalCanvas.height = this.canvas.height;
      finalCtx.imageSmoothingEnabled = false;
      finalCtx.drawImage(this.offscreenCanvas, 0, 0);
    }
    return finalCanvas;
  }

  offerManualCopyFallback() {
    const dataUrl = this.prepareFinalCanvas().toDataURL('image/png', 1.0);
    const toast = this.showToast('Clipboard access denied. Click here to download instead.', true, 'error');
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
      chrome.downloads.download({
        url: dataUrl,
        filename: `SnipScreen-${Date.now()}.png`,
        saveAs: true
      });
      this.toastElement.classList.remove('show');
    });
  }

  async saveImage() {
    try {
      const { storageEnabled } = await chrome.storage.sync.get({ storageEnabled: true });
      if (!storageEnabled) throw new Error('Save feature disabled');
      
      if (!this.currentImageData) throw new Error('No image to save');
      
      this.showSpinner(true);
      this.showToast('Saving screenshot...', true);
      
      const finalCanvas = this.prepareFinalCanvas();
      const dataUrl = finalCanvas.toDataURL('image/png', 1.0);
      const { saveLocation } = await chrome.storage.sync.get({ saveLocation: 'Downloads' });
      
      await this.tryDownload(dataUrl, `${saveLocation}/SnipScreen-${Date.now()}.png`, 2);
      
      this.showToast('Screenshot saved successfully!', false, 'success');
    } catch (error) {
      console.error('Save failed:', error);
      this.showToast(`Save failed: ${error.message || 'Unknown error'}`, false, 'error');
      this.activeTools.clear();
      document.querySelectorAll('.tool-item').forEach(item => item.classList.remove('active'));
    } finally {
      this.showSpinner(false);
    }
  }

  async tryDownload(url, filename, retries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await chrome.downloads.download({ url, filename, saveAs: false });
        return;
      } catch (error) {
        if (attempt === retries) throw new Error(`Download failed after ${retries + 1} attempts: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
  }

  getMousePos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  }

  handleMouseDown(e) {
    const pos = this.getMousePos(e);
    this.isDrawing = true;
    
    if (this.activeTools.has('crop')) {
      this.cropStart = pos;
      this.canvas.style.cursor = 'crosshair';
    }
    
    if (this.activeTools.has('annotate')) {
      this.annotateStart = pos;
      this.offscreenCtx.beginPath();
      this.offscreenCtx.moveTo(pos.x, pos.y);
      this.offscreenCtx.strokeStyle = '#000000';
      this.offscreenCtx.lineWidth = 2;
    }
  }

  handleMouseMove(e) {
    if (!this.isDrawing) return;
    const pos = this.getMousePos(e);
    
    if (this.activeTools.has('crop') && this.cropStart) {
      const clampedPos = {
        x: Math.max(0, Math.min(pos.x, this.canvas.width)),
        y: Math.max(0, Math.min(pos.y, this.canvas.height))
      };
      this.canvas.style.cursor = 'crosshair';
      this.throttledDrawCropGuides(clampedPos);
    }
    
    if (this.activeTools.has('annotate')) {
      const width = pos.x - this.annotateStart.x;
      const height = pos.y - this.annotateStart.y;
      requestAnimationFrame(() => {
        this.offscreenCtx.fillStyle = '#000000';
        this.offscreenCtx.fillRect(this.annotateStart.x, this.annotateStart.y, width, height);
        this.offscreenCtx.strokeStyle = '#000000';
        this.offscreenCtx.lineWidth = 1;
        this.offscreenCtx.strokeRect(this.annotateStart.x, this.annotateStart.y, width, height);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.offscreenCanvas, 0, 0);
      });
    }
  }

  handleMouseUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    
    const pos = this.getMousePos(e);
    
    if (this.activeTools.has('crop')) {
      this.cropEnd = {
        x: Math.max(0, Math.min(pos.x, this.canvas.width)),
        y: Math.max(0, Math.min(pos.y, this.canvas.height))
      };
      this.completeCrop();
      this.canvas.style.cursor = 'default';
    }
    
    if (this.activeTools.has('annotate')) {
      this.offscreenCtx.closePath();
      this.currentImageData = this.offscreenCtx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.offscreenCanvas, 0, 0);
    }
  }

  drawCropGuides(x, y, width, height) {
    const maxWidth = this.canvas.width - x;
    const maxHeight = this.canvas.height - y;
    width = Math.max(0, Math.min(width, maxWidth));
    height = Math.max(0, Math.min(height, maxHeight));
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.offscreenCanvas, 0, 0);
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.ctx.fillRect(0, 0, this.canvas.width, y);
    this.ctx.fillRect(0, y + height, this.canvas.width, this.canvas.height - (y + height));
    this.ctx.fillRect(0, y, x, height);
    this.ctx.fillRect(x + width, y, this.canvas.width - (x + width), height);
    
    this.ctx.setLineDash([4, 4]);
    this.ctx.strokeStyle = '#FFFFFF';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x, y, width, height);
    
    this.ctx.setLineDash([]);
    this.ctx.strokeStyle = '#007AFF';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(x - 1, y - 1, width + 2, height + 2);
    
    this.drawCornerHandles(x, y, width, height);
  }

  drawCornerHandles(x, y, width, height) {
    const handleSize = 10;
    const corners = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height]
    ];
    
    this.ctx.fillStyle = '#007AFF';
    corners.forEach(([cx, cy]) => {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, handleSize / 2, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  showToast(message, persist = false, type = 'info') {
    this.toastElement.textContent = message;
    this.toastElement.style.background = type === 'error' ? 'rgba(255, 59, 48, 0.9)' :
                                         type === 'success' ? 'rgba(52, 199, 89, 0.9)' :
                                         'rgba(50, 50, 50, 0.9)';
    requestAnimationFrame(() => this.toastElement.classList.add('show'));
    if (!persist) {
      setTimeout(() => {
        this.toastElement.classList.remove('show');
      }, type === 'error' ? 5000 : 2500);
    } else {
      this.toastElement.dataset.persistent = 'true';
    }
    return this.toastElement;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ScreenshotEditor();
});