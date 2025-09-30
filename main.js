const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { createWorker } = require('tesseract.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('process-folder', async () => {
  mainWindow.webContents.send('status-update', 'Opening folder selection...');
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    mainWindow.webContents.send('status-update', 'Folder selection canceled.');
    return { success: false, message: 'Folder selection canceled.' };
  }

  const folderPath = filePaths[0];
  const sortedDocumentsDir = path.join(__dirname, 'Sorted Documents');
  const unsortedDocumentsDir = path.join(__dirname, 'Unsorted Documents');

  try {
    if (!fs.existsSync(sortedDocumentsDir)) fs.mkdirSync(sortedDocumentsDir);
    if (!fs.existsSync(unsortedDocumentsDir)) fs.mkdirSync(unsortedDocumentsDir);

    const files = fs.readdirSync(folderPath);
    mainWindow.webContents.send('status-update', `Found ${files.length} files. Starting batch processing...`);

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      mainWindow.webContents.send('status-update', `Processing: ${file}`);

      try {
        const worker = await createWorker('eng');
        const { data: { text } } = await worker.recognize(filePath);
        await worker.terminate();

        let cleanedText = text.replace(/[^a-zA-Z0-9\s\/\-]/g, '').replace(/\s+/g, ' ').trim();
        
        let extractedName = 'N/A';
        const nameRegex = /(?:[A-Z][a-z]+\s){1,3}[A-Z][a-z]+/; // Simplified name regex
        let match = cleanedText.match(nameRegex);
        if (match && match[0]) {
            extractedName = match[0];
        }

        if (extractedName !== 'N/A') {
          const sanitizedFolderName = extractedName.replace(/[/\\?%*:|"<>]/g, '-');
          const userFolder = path.join(sortedDocumentsDir, sanitizedFolderName);
          if (!fs.existsSync(userFolder)) {
            fs.mkdirSync(userFolder, { recursive: true });
          }
          const destinationPath = path.join(userFolder, path.basename(filePath));
          fs.renameSync(filePath, destinationPath);
          mainWindow.webContents.send('status-update', `Sorted: ${file} -> ${sanitizedFolderName}`);
        } else {
          const destinationPath = path.join(unsortedDocumentsDir, path.basename(filePath));
          fs.renameSync(filePath, destinationPath);
          mainWindow.webContents.send('status-update', `Could not extract name from: ${file}. Moved to unsorted.`);
        }
      } catch (fileError) {
        console.error(`Error processing ${file}:`, fileError);
        const destinationPath = path.join(unsortedDocumentsDir, path.basename(filePath));
        fs.renameSync(filePath, destinationPath); // Move to unsorted on error
        mainWindow.webContents.send('status-update', `Error processing ${file}. Moved to unsorted.`);
      }
    }

    const successMessage = 'Batch processing complete. All files have been sorted.';
    mainWindow.webContents.send('status-update', successMessage);
    return { success: true, message: successMessage };

  } catch (error) {
    console.error('An error occurred during batch processing:', error);
    mainWindow.webContents.send('status-update', `Error: ${error.message}`);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('process-document', async () => {
  mainWindow.webContents.send('status-update', 'Opening file dialog...');
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
  });

  if (canceled || !filePaths || filePaths.length === 0) {
    mainWindow.webContents.send('status-update', 'File selection canceled.');
    return { success: false, message: 'File selection canceled.' };
  }

  const filePath = filePaths[0];
  const sortedDocumentsDir = path.join(__dirname, 'Sorted Documents');

  try {
    if (!fs.existsSync(sortedDocumentsDir)) {
      fs.mkdirSync(sortedDocumentsDir);
    }

    mainWindow.webContents.send('status-update', 'Starting OCR process...');
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(filePath);
    await worker.terminate();
    console.log("---- Full OCR Text Start ----\n", text, "\n---- Full OCR Text End ----");
    
    // Aggressive Text Cleaning
    let cleanedText = text.replace(/[^a-zA-Z0-9\s\/\-]/g, '') // Allow / and - for dates
                           .replace(/\s+/g, ' ')
                           .trim();

    mainWindow.webContents.send('status-update', 'OCR finished. Extracting info...');

    let extractedName = 'N/A';
    let extractedDob = 'N/A';
    let extractedGender = 'N/A';
    let extractedAadhaar = 'N/A';
    let note = cleanedText; // Initialize note with cleaned text

    // Extract Name (looking for patterns like 'Name: [Name]' or just a name after some keywords)
    const nameRegex = /(?:[A-Z][a-z]+\s){1,3}[A-Z][a-z]+/; // Looks for 2 to 4 capitalized words
    let match = cleanedText.match(nameRegex);
    if (match && match[0]) {
        extractedName = match[0];
        note = note.replace(match[0], '').trim();
    } else {
        // Fallback: try to find a name without a preceding keyword, often the first capitalized words
        const fallbackNameRegex = /(?:[A-Z][a-z]+\s){1,3}[A-Z][a-z]+/; // Looks for 2 to 4 capitalized words
        match = cleanedText.match(fallbackNameRegex);
        if (match && match[0]) {
            extractedName = match[0];
            note = note.replace(match[0], '').trim();
        }
    }

    // Extract DOB
    const dobRegex = /(?:DOB|Date of Birth|Year of Birth):?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4})/; // DD/MM/YYYY, DD-MM-YYYY or YYYY
    match = cleanedText.match(dobRegex);
    if (match && match[1]) {
        extractedDob = match[1];
        note = note.replace(match[0], '').trim();
    }

    // Extract Gender
    const genderRegex = /(Male|Female)/i;
    match = cleanedText.match(genderRegex);
    if (match && match[1]) {
        extractedGender = match[1];
        note = note.replace(match[0], '').trim();
    }

    // Extract Aadhaar Number (12 digits, possibly with spaces)
    const aadhaarRegex = /(\d{4}\s\d{4}\s\d{4}|\d{12})/; // 12 digits, with or without spaces
    match = cleanedText.match(aadhaarRegex);
    if (match && match[1]) {
        extractedAadhaar = match[1].replace(/\s/g, ''); // Remove spaces if present
        note = note.replace(match[0], '').trim();
    }

    // Final formatted output
    const finalOutput = `Name: ${extractedName}; DOB: ${extractedDob}; Gender: ${extractedGender}; Aadhaar: ${extractedAadhaar}; Note: ${note}`;
    mainWindow.webContents.send('status-update', `Extracted Info: ${finalOutput}`);

    // For sorting, we still need a name. If not extracted, use a placeholder.
    const folderName = extractedName !== 'N/A' ? extractedName : 'Unknown_User';
    const sanitizedFolderName = folderName.replace(/[/\\?%*:|"<>]/g, '-');
    mainWindow.webContents.send('status-update', `Info found: ${sanitizedFolderName}. Sorting file...`);

    const userFolder = path.join(sortedDocumentsDir, sanitizedFolderName);
    if (!fs.existsSync(userFolder)) {
      fs.mkdirSync(userFolder, { recursive: true });
    }

    const destinationPath = path.join(userFolder, path.basename(filePath));
    
    try {
        fs.renameSync(filePath, destinationPath);
    } catch (err) {
        if (err.code === 'EXDEV') {
            fs.copyFileSync(filePath, destinationPath);
            fs.unlinkSync(filePath);
        } else {
            throw err;
        }
    }

    const successMessage = `Successfully sorted document for ${sanitizedFolderName}.`;
    mainWindow.webContents.send('status-update', successMessage);
    return { success: true, message: successMessage };

  } catch (error) {
    console.error('An error occurred:', error);
    mainWindow.webContents.send('status-update', `Error: ${error.message}`);
    return { success: false, message: error.message };
  }
});

async function extractAadhaarInfo(text) {
    // This function is now integrated into the ipcMain.handle block
    // and is kept as a placeholder or for future expansion if needed.
    // For now, its logic is directly in the ipcMain.handle block.
    return { isAadhaar: true, name: null }; // Placeholder return
}