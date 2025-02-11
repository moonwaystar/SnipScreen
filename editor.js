class ScreenshotEditor {
  constructor() {
    this.canvas = document.getElementById('editorCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.currentTool = null;
    this.isDrawing = false;
    this.cropStart = null;
    this.cropEnd = null;
    this.cropOverlay = document.createElement('canvas');
    this.cropCtx = this.cropOverlay.getContext('2d');
    
    this.initializeButtons();
    this.loadScreenshot();
    this.setupEventListeners();
  }

  async loadScreenshot() {
    const { currentScreenshot } = await chrome.storage.local.get(['currentScreenshot']);
    const img = new Image();
    img.onload = () => {
      this.canvas.width = img.width;
      this.canvas.height = img.height;
      this.cropOverlay.width = img.width;
      this.cropOverlay.height = img.height;
      this.ctx.drawImage(img, 0, 0);
      this.originalImage = img;
    };
    img.src = currentScreenshot;
  }

  initializeButtons() {
    document.getElementById('cropBtn').addEventListener('click', () => this.setTool('crop'));
    document.getElementById('annotateBtn').addEventListener('click', () => this.setTool('annotate'));
    document.getElementById('saveBtn').addEventListener('click', () => this.saveImage());
  }

  setTool(tool) {
    this.currentTool = tool;
    this.clearSelection();
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
    this.isDrawing = true;
    const pos = this.getMousePos(e);
    
    if (this.currentTool === 'crop') {
      this.cropStart = pos;
    }
    
    if (this.currentTool === 'annotate') {
      this.annotateStart = pos;
    }
  }

  handleMouseMove(e) {
    if (!this.isDrawing) return;
    
    const pos = this.getMousePos(e);
    
    if (this.currentTool === 'crop') {
      this.cropCtx.clearRect(0, 0, this.cropOverlay.width, this.cropOverlay.height);
      this.cropCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      this.cropCtx.fillRect(0, 0, this.cropOverlay.width, this.cropOverlay.height);
      
      const width = pos.x - this.cropStart.x;
      const height = pos.y - this.cropStart.y;
      
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.drawImage(this.originalImage, 0, 0);
      this.ctx.drawImage(this.cropOverlay, 0, 0);
      this.cropCtx.clearRect(this.cropStart.x, this.cropStart.y, width, height);
    }
    
    if (this.currentTool === 'annotate') {
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
    
    if (this.currentTool === 'crop') {
      this.cropEnd = pos;
    }
  }

  clearSelection() {
    this.cropStart = null;
    this.cropEnd = null;
    this.cropCtx.clearRect(0, 0, this.cropOverlay.width, this.cropOverlay.height);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.originalImage, 0, 0);
  }

  async saveImage() {
    let finalCanvas = document.createElement('canvas');
    let finalCtx = finalCanvas.getContext('2d');
    
    if (this.cropStart && this.cropEnd && this.currentTool === 'crop') {
      const width = Math.abs(this.cropEnd.x - this.cropStart.x);
      const height = Math.abs(this.cropEnd.y - this.cropStart.y);
      const startX = Math.min(this.cropStart.x, this.cropEnd.x);
      const startY = Math.min(this.cropStart.y, this.cropEnd.y);
      
      finalCanvas.width = width;
      finalCanvas.height = height;
      finalCtx.drawImage(
        this.originalImage,
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
  }
}

new ScreenshotEditor();