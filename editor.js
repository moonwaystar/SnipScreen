class ScreenshotEditor {
  constructor() {
    this.canvas = document.getElementById('editorCanvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.activeTools = new Set();
    this.isDrawing = false;
    this.cropStart = null;
    this.cropEnd = null;
    this.cropOverlay = document.createElement('canvas');
    this.cropCtx = this.cropOverlay.getContext('2d', { willReadFrequently: true });
    this.cropGuides = { width: 0, height: 0 };
    this.currentImageData = null;
    
    this.initializeButtons();
    this.loadScreenshot();
    this.setupEventListeners();
    
    window.addEventListener('beforeunload', () => this.cleanup());
    
    this.throttledDrawCropGuides = this.throttle((pos) => {
      const width = pos.x - this.cropStart.x;
      const height = pos.y - this.cropStart.y;
      const startX = Math.min(this.cropStart.x, pos.x);
      const startY = Math.min(this.cropStart.y, pos.y);
      this.drawCropGuides(startX, startY, Math.abs(width), Math.abs(height));
    }, 16);
  }

  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
  }

  cleanup() {
    chrome.storage.local.remove(['currentScreenshot', 'originalTab']);
    this.ctx = null;
    this.cropCtx = null;
    this.canvas = null;
    this.cropOverlay = null;
    this.originalImage = null;
    this.currentImageData = null;
  }

  async loadScreenshot() {
    try {
      const { currentScreenshot } = await chrome.storage.local.get(['currentScreenshot']);
      const img = new Image();
      img.onload = () => {
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.cropOverlay.width = img.width;
        this.cropOverlay.height = img.height;
        this.ctx.drawImage(img, 0, 0);
        this.originalImage = img;
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      };
      img.src = currentScreenshot;
    } catch (error) {
      console.error('Failed to load screenshot:', error);
      this.showToast('Failed to load screenshot');
    }
  }

  initializeButtons() {
    const buttons = ['crop', 'annotate'];
    buttons.forEach(tool => {
      const btn = document.getElementById(`${tool}Btn`);
      btn.addEventListener('click', () => this.toggleTool(tool));
    });
    
    document.getElementById('shareBtn').addEventListener('click', () => this.copyToClipboard());
    document.getElementById('saveBtn').addEventListener('click', async () => {
      this.showToast('Saving screenshot...');
      await this.saveImage();
      this.showToast('Screenshot saved successfully!');
    });
  }

  toggleTool(tool) {
    const btn = document.getElementById(`${tool}Btn`);
    const otherTool = tool === 'crop' ? 'annotate' : 'crop';
    const otherBtn = document.getElementById(`${otherTool}Btn`);
    
    if (this.activeTools.has(tool)) {
      this.activeTools.delete(tool);
      btn.classList.remove('active');
      btn.classList.add('secondary');
    } else {
      if (this.activeTools.has(otherTool)) {
        this.activeTools.delete(otherTool);
        otherBtn.classList.remove('active');
        otherBtn.classList.add('secondary');
        this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      }
      
      this.activeTools.add(tool);
      btn.classList.remove('secondary');
      btn.classList.add('active');
    }
    
    if (tool === 'crop' && this.currentImageData) {
      this.ctx.putImageData(this.currentImageData, 0, 0);
    }
  }

  async copyToClipboard() {
    try {
      let finalCanvas = document.createElement('canvas');
      let finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
      
      if (this.cropStart && this.cropEnd && this.activeTools.has('crop')) {
        const width = Math.abs(this.cropEnd.x - this.cropStart.x);
        const height = Math.abs(this.cropEnd.y - this.cropStart.y);
        const startX = Math.min(this.cropStart.x, this.cropEnd.x);
        const startY = Math.min(this.cropStart.y, this.cropEnd.y);
        
        finalCanvas.width = width;
        finalCanvas.height = height;
        finalCtx.drawImage(
          this.canvas,
          startX,
          startY,
          width,
          height,
          0,
          0,
          width,
          height
        );
      } else {
        finalCanvas.width = this.canvas.width;
        finalCanvas.height = this.canvas.height;
        finalCtx.drawImage(this.canvas, 0, 0);
      }

      const dataUrl = finalCanvas.toDataURL('image/png');
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      this.showToast('Screenshot copied to clipboard!');
    } catch (error) {
      console.error('Copy failed:', error);
      this.showToast(`Failed to copy: ${error.message}`);
    }
  }

  setupEventListeners() {
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
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
    }
    
    if (this.activeTools.has('annotate')) {
      this.annotateStart = pos;
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
      this.ctx.strokeStyle = '#000000';
      this.ctx.lineWidth = 2;
    }
  }

  handleMouseMove(e) {
    if (!this.isDrawing) return;
    
    const pos = this.getMousePos(e);
    
    if (this.activeTools.has('crop') && this.cropStart) {
      this.throttledDrawCropGuides(pos);
    }
    
    if (this.activeTools.has('annotate')) {
      const width = pos.x - this.annotateStart.x;
      const height = pos.y - this.annotateStart.y;
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(this.annotateStart.x, this.annotateStart.y, width, height);
    }
  }

  handleMouseUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    
    const pos = this.getMousePos(e);
    
    if (this.activeTools.has('crop')) {
      this.cropEnd = pos;
    }
    
    if (this.activeTools.has('annotate')) {
      this.ctx.closePath();
      this.currentImageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  drawCropGuides(x, y, width, height) {
    this.cropCtx.clearRect(0, 0, this.cropOverlay.width, this.cropOverlay.height);
    
    this.cropCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.cropCtx.fillRect(0, 0, this.cropOverlay.width, this.cropOverlay.height);
    
    this.cropCtx.clearRect(x, y, width, height);
    
    this.cropCtx.setLineDash([5, 5]);
    this.cropCtx.strokeStyle = '#ffffff';
    this.cropCtx.lineWidth = 2;
    this.cropCtx.strokeRect(x, y, width, height);
    
    this.cropCtx.setLineDash([]);
    this.cropCtx.strokeStyle = '#2196F3';
    this.cropCtx.lineWidth = 1;
    this.cropCtx.strokeRect(x - 1, y - 1, width + 2, height + 2);
    
    this.drawCornerHandles(x, y, width, height);
    this.showCropDimensions(x, y, width, height);
    
    if (this.currentImageData) {
      this.ctx.putImageData(this.currentImageData, 0, 0);
    } else {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.originalImage, 0, 0);
    }
    this.ctx.drawImage(this.cropOverlay, 0, 0);
  }

  drawCornerHandles(x, y, width, height) {
    const handleSize = 8;
    const corners = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height]
    ];
    
    this.cropCtx.fillStyle = '#2196F3';
    corners.forEach(([cx, cy]) => {
      this.cropCtx.fillRect(
        cx - handleSize/2,
        cy - handleSize/2,
        handleSize,
        handleSize
      );
    });
  }

  showCropDimensions(x, y, width, height) {
    this.cropCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    const text = `${Math.round(width)} × ${Math.round(height)}`;
    this.cropCtx.font = '12px Arial';
    const textWidth = this.cropCtx.measureText(text).width;
    this.cropCtx.fillRect(x + 5, y + 5, textWidth + 10, 20);
    
    this.cropCtx.fillStyle = '#ffffff';
    this.cropCtx.fillText(text, x + 10, y + 19);
  }

  async saveImage() {
    try {
      let finalCanvas = document.createElement('canvas');
      let finalCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
      
      if (this.cropStart && this.cropEnd && this.activeTools.has('crop')) {
        const width = Math.abs(this.cropEnd.x - this.cropStart.x);
        const height = Math.abs(this.cropEnd.y - this.cropStart.y);
        const startX = Math.min(this.cropStart.x, this.cropEnd.x);
        const startY = Math.min(this.cropStart.y, this.cropEnd.y);
        
        finalCanvas.width = width;
        finalCanvas.height = height;
        finalCtx.drawImage(
          this.canvas,
          startX,
          startY,
          width,
          height,
          0,
          0,
          width,
          height
        );
      } else {
        finalCanvas.width = this.canvas.width;
        finalCanvas.height = this.canvas.height;
        finalCtx.drawImage(this.canvas, 0, 0);
      }

      const imageUrl = finalCanvas.toDataURL('image/png', 1.0);
      const { saveLocation } = await chrome.storage.sync.get(['saveLocation']);
      
      await chrome.downloads.download({
        url: imageUrl,
        filename: `${saveLocation}/screenshot-${Date.now()}.png`,
        saveAs: false
      });
    } catch (error) {
      this.showToast(`Save failed: ${error.message}`);
      console.error('Save failed:', error);
    }
  }

  showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    toast.offsetHeight;
    toast.classList.add('show');

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ScreenshotEditor();
});