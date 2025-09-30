const importBtn = document.getElementById('import-btn');
const importFolderBtn = document.getElementById('import-folder-btn');
const statusDiv = document.getElementById('status');

importBtn.addEventListener('click', async () => {
  importBtn.disabled = true;
  statusDiv.textContent = 'Preparing to process...';
  try {
    const result = await window.api.processDocument();
    if (result.success) {
      statusDiv.textContent = result.message;
    } else {
      statusDiv.textContent = `Failed: ${result.message}`;
    }
  } catch (error) {
    statusDiv.textContent = `An error occurred: ${error.message}`;
  }
  importBtn.disabled = false;
});

importFolderBtn.addEventListener('click', async () => {
  importFolderBtn.disabled = true;
  statusDiv.textContent = 'Preparing to process folder...';
  try {
    const result = await window.api.processFolder();
    if (result.success) {
      statusDiv.textContent = result.message;
    } else {
      statusDiv.textContent = `Failed: ${result.message}`;
    }
  } catch (error) {
    statusDiv.textContent = `An error occurred: ${error.message}`;
  }
  importFolderBtn.disabled = false;
});

window.api.onStatusUpdate((message) => {
  statusDiv.textContent = message;
});