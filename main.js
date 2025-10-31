const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { PythonShell } = require("python-shell");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});



app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/**
 * Parse Python script output and extract JSON
 */
function parsePythonOutput(results) {
  console.log('Raw Python output:', results);
  
  const jsonStartIndex = results.findIndex(line => line.includes('---JSON-START---'));
  const jsonEndIndex = results.findIndex(line => line.includes('---JSON-END---'));
  
  if (jsonStartIndex === -1 || jsonEndIndex === -1) {
    throw new Error('JSON delimiters not found in Python output');
  }
  
  const jsonLines = results.slice(jsonStartIndex + 1, jsonEndIndex);
  const jsonString = jsonLines.join('').trim();
  
  if (!jsonString) {
    throw new Error('Empty JSON string extracted');
  }
  
  console.log('Extracted JSON string:', jsonString);
  
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e.message}. JSON string: ${jsonString.substring(0, 200)}`);
  }
}

/**
 * Process a file with Python NER script
 */
async function processFileWithPython(filePath) {
  try {
    // TODO: It is recommended to load the API key from a more secure location, such as an environment variable or a configuration file.
    const results = await PythonShell.run("ner.py", {
      args: [filePath],
      pythonOptions: ['-u'], // Unbuffered output
      env: {
        GEMINI_API_KEY: "AIzaSyCANxzIJJkbBDjWGAo-Qnc7-PZSjeU7tGg"
      }
    });
    
    const parsed = parsePythonOutput(results);
    
    // Check if it's an array (expected format)
    if (!Array.isArray(parsed)) {
      throw new Error('Expected array from Python script');
    }
    
    if (parsed.length === 0) {
      throw new Error('Empty results array from Python script');
    }
    
    const result = parsed[0];
    
    // Check for errors in the result
    if (result.error) {
      throw new Error(`Python script error: ${result.error}`);
    }
    
    return result;
    
  } catch (error) {
    console.error('Python processing error:', error);
    throw error;
  }
}

/**
 * Move file to destination (handles cross-device moves)
 */
function moveFile(sourcePath, destPath) {
  try {
    fs.renameSync(sourcePath, destPath);
  } catch (err) {
    if (err.code === "EXDEV") {
      // Cross-device move - copy then delete
      fs.copyFileSync(sourcePath, destPath);
      fs.unlinkSync(sourcePath);
    } else {
      throw err;
    }
  }
}

/**
 * Sanitize filename/folder name
 */
function sanitizeName(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim();
}

ipcMain.handle("process-folder", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  
  if (canceled || !filePaths?.length) {
    return { success: false, message: "No folder selected." };
  }

  const folderPath = filePaths[0];
  const sortedDir = path.join(__dirname, "Sorted Documents");
  const unsortedDir = path.join(__dirname, "Unsorted Documents");

  // Ensure directories exist
  if (!fs.existsSync(sortedDir)) {
    fs.mkdirSync(sortedDir, { recursive: true });
  }
  if (!fs.existsSync(unsortedDir)) {
    fs.mkdirSync(unsortedDir, { recursive: true });
  }

  const files = fs.readdirSync(folderPath).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.pdf'].includes(ext);
  });
  
  if (files.length === 0) {
    mainWindow.webContents.send("status-update", "⚠️ No supported files found in folder.");
    return { success: false, message: "No supported files found." };
  }

  mainWindow.webContents.send(
    "status-update",
    `Processing ${files.length} files...`
  );

  let successCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    mainWindow.webContents.send("status-update", `🔄 Processing: ${file}`);

    try {
      const result = await processFileWithPython(filePath);
      const extractedName = result.name;

      if (extractedName && typeof extractedName === 'string' && extractedName.trim()) {
        // Create folder for this person
        const sanitized = sanitizeName(extractedName);
        const destinationFolder = path.join(sortedDir, sanitized);
        
        if (!fs.existsSync(destinationFolder)) {
          fs.mkdirSync(destinationFolder, { recursive: true });
        }

        const destinationPath = path.join(destinationFolder, file);
        moveFile(filePath, destinationPath);
        
        successCount++;
        mainWindow.webContents.send(
          "status-update",
          `✅ Sorted: ${file} → ${sanitized}`
        );
      } else {
        // No name found - move to unsorted
        const destinationPath = path.join(unsortedDir, file);
        moveFile(filePath, destinationPath);
        
        errorCount++;
        mainWindow.webContents.send(
          "status-update",
          `⚠️ Could not extract name from ${file}, moved to Unsorted`
        );
      }
      
    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err);
      
      // Move to unsorted on error
      try {
        const destinationPath = path.join(unsortedDir, file);
        moveFile(filePath, destinationPath);
      } catch (moveErr) {
        console.error(`Failed to move ${file} to unsorted:`, moveErr);
      }
      
      errorCount++;
      mainWindow.webContents.send(
        "status-update",
        `❌ Error processing ${file}: ${err.message}`
      );
    }
  }

  mainWindow.webContents.send(
    "status-update",
    `✅ Processing complete! Sorted: ${successCount}, Unsorted: ${errorCount}`
  );
  
  return { success: true, sorted: successCount, unsorted: errorCount };
});

ipcMain.handle("process-document", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg"] },
      { name: "PDF", extensions: ["pdf"] }
    ],
  });

  if (canceled || !filePaths?.length) {
    return { success: false, message: "No file selected." };
  }

  const filePath = filePaths[0];
  const fileName = path.basename(filePath);
  const sortedDir = path.join(__dirname, "Sorted Documents");
  const unsortedDir = path.join(__dirname, "Unsorted Documents");

  // Ensure directories exist
  if (!fs.existsSync(sortedDir)) {
    fs.mkdirSync(sortedDir, { recursive: true });
  }
  if (!fs.existsSync(unsortedDir)) {
    fs.mkdirSync(unsortedDir, { recursive: true });
  }

  mainWindow.webContents.send(
    "status-update",
    "🔄 Running OCR and NER on document..."
  );

  try {
    const result = await processFileWithPython(filePath);
    const extractedName = result.name;

    if (extractedName && typeof extractedName === 'string' && extractedName.trim()) {
      // Create folder for this person
      const sanitized = sanitizeName(extractedName);
      const userFolder = path.join(sortedDir, sanitized);
      
      if (!fs.existsSync(userFolder)) {
        fs.mkdirSync(userFolder, { recursive: true });
      }

      const destPath = path.join(userFolder, fileName);
      moveFile(filePath, destPath);
      
      mainWindow.webContents.send(
        "status-update",
        `✅ Document sorted under: ${sanitized}`
      );
      
      return { 
        success: true, 
        name: sanitized, 
        details: result 
      };
      
    } else {
      // No name found - move to unsorted
      const destPath = path.join(unsortedDir, fileName);
      moveFile(filePath, destPath);
      
      mainWindow.webContents.send(
        "status-update",
        `⚠️ Could not extract name from ${fileName}, moved to Unsorted`
      );
      
      return { 
        success: true, 
        name: null, 
        message: "No name extracted" 
      };
    }
    
  } catch (err) {
    console.error(`❌ Error processing ${fileName}:`, err);
    
    // Move to unsorted on error
    try {
      const destPath = path.join(unsortedDir, fileName);
      moveFile(filePath, destPath);
    } catch (moveErr) {
      console.error(`Failed to move ${fileName} to unsorted:`, moveErr);
    }
    
    mainWindow.webContents.send(
      "status-update",
      `❌ Error processing ${fileName}: ${err.message}`
    );
    
    return { 
      success: false, 
      message: err.message 
    };
  }
});

ipcMain.handle("get-sorted-documents", async () => {
  const sortedDir = path.join(__dirname, "Sorted Documents");
  const result = {};

  if (fs.existsSync(sortedDir)) {
    const folders = fs.readdirSync(sortedDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const folder of folders) {
      const folderPath = path.join(sortedDir, folder);
      const files = fs.readdirSync(folderPath);
      result[folder] = files;
    }
  }

  return result;
});
