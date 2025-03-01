// Immediately notify that the content script is loaded
chrome.runtime.sendMessage({ action: 'contentScriptLoaded' });

// Main content script functionality
(function() {
  console.log('PR Security Analyzer content script loaded');
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('Content script received message:', request);
    
    if (request.action === 'getCode') {
      try {
        const files = getAddedCode();
        console.log('Found files:', Object.keys(files).length);
        
        if (Object.keys(files).length === 0) {
          console.log('No files found in PR');
          sendResponse({
            error: 'No modified files found in this PR',
            files: null
          });
          return true;
        }
        
        sendResponse({files: files});
      } catch (error) {
        console.error('Error getting code:', error);
        sendResponse({
          error: error.message,
          files: null
        });
      }
    }
    return true;
  });
  
  function getAddedCode() {
    const files = {};
    
    // Check if we're on a PR page
    if (!window.location.pathname.includes('/pull/')) {
      throw new Error('Not on a GitHub PR page');
    }
    
    // Get all file containers
    const fileContainers = document.querySelectorAll('.file');
    console.log('Found file containers:', fileContainers.length);
    
    if (fileContainers.length === 0) {
      throw new Error('No file changes found in this PR');
    }
    
    fileContainers.forEach(container => {
      try {
        const fileHeader = container.querySelector('.file-header');
        if (!fileHeader) {
          console.log('No file header found for container');
          return;
        }
        
        const filePath = fileHeader.getAttribute('data-path');
        if (!filePath) {
          console.log('No file path found in header');
          return;
        }
        
        // Get all added lines in this file
        const addedLines = container.querySelectorAll('.blob-code-addition');
        console.log(`Found ${addedLines.length} added lines in ${filePath}`);
        
        if (addedLines.length === 0) return;
        
        const codeLines = [];
        addedLines.forEach(line => {
          const codeElement = line.querySelector('.blob-code-inner');
          if (!codeElement) {
            console.log('No code element found in line');
            return;
          }
          
          const code = codeElement.textContent.trim();
          if (code) {
            codeLines.push(code);
          }
        });
        
        if (codeLines.length > 0) {
          files[filePath] = codeLines.join('\n');
          console.log(`Added ${codeLines.length} lines from ${filePath}`);
        }
      } catch (error) {
        console.error('Error processing file container:', error);
      }
    });
    
    return files;
  }
})();
  