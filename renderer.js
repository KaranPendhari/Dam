// DOM Elements
const imageFolderBtn = document.getElementById('image-folder-btn');
const imageFileBtn = document.getElementById('image-file-btn');
const pdfFolderBtn = document.getElementById('pdf-folder-btn');
const pdfFileBtn = document.getElementById('pdf-file-btn');
const statusDiv = document.getElementById('status');
const sortedFilesList = document.getElementById('sorted-files-list');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const duplicateBadge = document.getElementById('duplicates-badge');
const duplicateCount = document.getElementById('duplicate-count');

// Stats Elements
const totalProcessed = document.getElementById('total-processed');
const totalSorted = document.getElementById('total-sorted');
const totalPeople = document.getElementById('total-people');
const successRate = document.getElementById('success-rate');

// Statistics
let stats = {
  processed: 0,
  sorted: 0,
  people: 0,
  failed: 0
};

// Toast Notification System
function showToast(title, message, type = 'success') {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ'
  };
  
  toast.innerHTML = `
    <div class="toast-icon">${icons[type] || icons.info}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// Update Status with Visual Feedback
function updateStatus(message, type = 'ready') {
  statusDiv.textContent = message;
  statusDiv.className = type;
  
  // Remove status classes and add the appropriate one
  statusDiv.classList.remove('processing', 'error');
  if (type === 'processing') {
    statusDiv.classList.add('processing');
  } else if (type === 'error') {
    statusDiv.classList.add('error');
  }
}

// Update Progress Bar
function updateProgress(percent, text) {
  progressContainer.classList.add('active');
  progressFill.style.width = `${percent}%`;
  progressText.textContent = text || `Processing... ${percent}%`;
}

// Hide Progress Bar
function hideProgress() {
  progressContainer.classList.remove('active');
  progressFill.style.width = '0%';
}

// Update Statistics
function updateStats() {
  totalProcessed.textContent = stats.processed;
  totalSorted.textContent = stats.sorted;
  totalPeople.textContent = stats.people;
  
  const rate = stats.processed > 0 
    ? Math.round((stats.sorted / stats.processed) * 100) 
    : 100;
  successRate.textContent = `${rate}%`;
  
  // Animate the numbers
  [totalProcessed, totalSorted, totalPeople, successRate].forEach(el => {
    el.style.animation = 'none';
    setTimeout(() => {
      el.style.animation = 'pulse 0.5s ease';
    }, 10);
  });
}

// Load Sorted Files with Enhanced UI
async function loadSortedFiles() {
  try {
    updateStatus('Loading sorted documents...', 'processing');
    
    const sortedDocuments = await window.api.getSortedDocuments();
    
    if (!sortedDocuments || Object.keys(sortedDocuments).length === 0) {
      sortedFilesList.innerHTML = `
        <p class="placeholder">
          Your sorted documents will appear here once processing is complete
        </p>
      `;
      updateStatus('Ready to sort your documents.');
      return;
    }
    
    let html = '';
    let totalFiles = 0;
    let peopleCount = 0;
    
    for (const folder in sortedDocuments) {
      peopleCount++;
      const files = sortedDocuments[folder];
      const fileCount = files.length;
      totalFiles += fileCount;
      
      html += `
        <div class="folder">
          <div class="folder-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <div class="folder-header-left">
              <span class="folder-icon">👤</span>
              <span>${folder}</span>
            </div>
            <span class="file-count">${fileCount} file${fileCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="folder-content">
      `;
      
      files.forEach((file, index) => {
        html += `
          <div class="file" style="animation-delay: ${index * 0.05}s">
            <span>${file}</span>
          </div>
        `;
      });
      
      html += `
          </div>
        </div>
      `;
    }
    
    sortedFilesList.innerHTML = html;
    
    // Update stats
    stats.sorted = totalFiles;
    stats.people = peopleCount;
    updateStats();
    
    updateStatus(`Loaded ${totalFiles} document${totalFiles !== 1 ? 's' : ''} from ${peopleCount} ${peopleCount !== 1 ? 'people' : 'person'}.`);
    
  } catch (error) {
    console.error('Error loading sorted files:', error);
    sortedFilesList.innerHTML = '<p class="placeholder">Error loading sorted files.</p>';
    updateStatus('Error loading sorted files.', 'error');
    showToast('Error', 'Failed to load sorted documents', 'error');
  }
}


// Process Button Handler
async function handleProcess(buttonElement, processFn, description) {
  buttonElement.disabled = true;
  updateStatus(`${description}...`, 'processing');
  updateProgress(10, `${description}...`);
  
  try {
    stats.processed++;
    updateStats();
    
    const result = await processFn();
    
    if (result.success) {
      hideProgress();
      updateStatus(result.message);
      showToast('Success', result.message, 'success');
      stats.sorted++;
      updateStats();
      
      // Reload sorted files to show updates
      setTimeout(() => loadSortedFiles(), 500);
    } else {
      hideProgress();
      updateStatus(`Failed: ${result.message}`, 'error');
      showToast('Processing Failed', result.message, 'error');
      stats.failed++;
      updateStats();
    }
  } catch (error) {
    hideProgress();
    updateStatus(`An error occurred: ${error.message}`, 'error');
    showToast('Error', error.message, 'error');
    stats.failed++;
    updateStats();
  } finally {
    buttonElement.disabled = false;
  }
}

// Button Event Listeners
imageFolderBtn.addEventListener('click', async () => {
  await handleProcess(
    imageFolderBtn,
    () => window.api.processFolder(),
    'Processing image folder'
  );
});

imageFileBtn.addEventListener('click', async () => {
  await handleProcess(
    imageFileBtn,
    () => window.api.processDocument(),
    'Processing image file'
  );
});

pdfFolderBtn.addEventListener('click', async () => {
  await handleProcess(
    pdfFolderBtn,
    () => window.api.processFolder(),
    'Processing PDF folder'
  );
});

pdfFileBtn.addEventListener('click', async () => {
  await handleProcess(
    pdfFileBtn,
    () => window.api.processDocument(),
    'Processing PDF file'
  );
});

// Listen for status updates from main process
window.api.onStatusUpdate((message) => {
  updateStatus(message, 'processing');
  
  // Try to extract progress percentage from message
  const progressMatch = message.match(/(\d+)%/);
  if (progressMatch) {
    updateProgress(parseInt(progressMatch[1]), message);
  }
  
  // Show toast for important updates
  if (message.includes('completed') || message.includes('success')) {
    showToast('Update', message, 'success');
  } else if (message.includes('error') || message.includes('failed')) {
    showToast('Error', message, 'error');
  }
});

// Tab Switching
document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab-button");
  const actionGroups = document.querySelectorAll(".btn-group");
  const description = document.getElementById("action-description");

  tabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      const dataType = event.target.getAttribute("data-type");

      // Update tab active state
      tabs.forEach((t) => t.classList.remove("active"));
      event.target.classList.add("active");

      // Switch action layout
      actionGroups.forEach((group) => {
        if (group.getAttribute("data-tab") === dataType) {
          group.classList.add("active");
        } else {
          group.classList.remove("active");
        }
      });

      // Update descriptive text with animations
      if (dataType === "image") {
        description.textContent = "Organize your image files with AI-powered recognition";
      } else if (dataType === "pdf") {
        description.textContent = "Sort PDF documents automatically by person";
      }
    });
  });

  // Load sorted files on startup
  loadSortedFiles();
  
  // Show welcome toast
  setTimeout(() => {
    showToast('Welcome', 'Ready to organize your documents!', 'info');
  }, 500);
});

// Duplicate Badge Click Handler
duplicateBadge.addEventListener('click', () => {
  showToast('Duplicates', 'Duplicate review feature coming soon!', 'info');
});

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + R to reload sorted files
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    loadSortedFiles();
    showToast('Refreshed', 'Sorted documents reloaded', 'success');
  }
  
  // Ctrl/Cmd + 1 for Images tab
  if ((e.ctrlKey || e.metaKey) && e.key === '1') {
    e.preventDefault();
    document.querySelector('.tab-button[data-type="image"]').click();
  }
  
  // Ctrl/Cmd + 2 for PDFs tab
  if ((e.ctrlKey || e.metaKey) && e.key === '2') {
    e.preventDefault();
    document.querySelector('.tab-button[data-type="pdf"]').click();
  }
});

// Auto-refresh sorted files every 30 seconds
setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadSortedFiles();
  }
}, 30000);

// Handle window visibility change
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadSortedFiles();
  }
});


window.api.onStatusUpdate((message) => {
  statusDiv.textContent = message;
});

document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tab-button");
  const actionGroups = document.querySelectorAll(".btn-group");

  tabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      const dataType = event.target.getAttribute("data-type");

      // 1. Update tab active state
      tabs.forEach((t) => t.classList.remove("active"));
      event.target.classList.add("active");

      // 2. Switch action layout
      actionGroups.forEach((group) => {
        if (group.getAttribute("data-tab") === dataType) {
          group.classList.add("active");
        } else {
          group.classList.remove("active");
        }
      });

      // Optional: Update descriptive text
      const description = document.getElementById("action-description");
      if (dataType === "image") {
        description.textContent =
          "Ready to sort your image files and folders.";
      } else if (dataType === "pdf") {
        description.textContent = "Ready to sort your PDF documents.";
      } else {
        description.textContent =
          "Select your files or folder to begin sorting.";
      }
    });
  });
});