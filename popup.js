// popup.js
document.addEventListener('DOMContentLoaded', function() {
    // Set initial state
    document.getElementById('risks').innerHTML = 
      '<div class="risk-title">Ready to Analyze</div>' +
      '<div style="color: #57606a; padding: 10px;">' +
      'Click the button below to analyze the current PR for security issues.' +
      '</div>';

    // Load security data only if we're on the same PR page
    chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
      const currentTab = tabs[0];
      const currentUrl = currentTab?.url || '';
      
      chrome.storage.local.get(['securityData', 'lastAnalyzedUrl'], function(result) {
        if (result.securityData && result.lastAnalyzedUrl === currentUrl) {
          updateUI(result.securityData);
        }
      });
    });
    
    // Set up analyze button
    document.getElementById('analyze-button').addEventListener('click', async function() {
      // Show loading indicator
      document.getElementById('loading').style.display = 'block';
      document.getElementById('risks').innerHTML = '';
      
      try {
        // Query for the active tab
        const tabs = await chrome.tabs.query({active: true, currentWindow: true});
        
        if (!tabs || tabs.length === 0) {
          throw new Error('Could not find active tab');
        }

        const currentTab = tabs[0];
        console.log('Current tab:', currentTab.url);

        if (!currentTab.url.includes('github.com')) {
          throw new Error('Please navigate to a GitHub PR page');
        }

        // Inject content script if not already injected
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['content.js']
        });

        // Wait a moment for the content script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        // Send message to content script to get the code
        const response = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(currentTab.id, {action: "getCode"}, function(response) {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });

        if (response && response.files) {
          console.log('Got files:', Object.keys(response.files).length);
          // Send the code to background script for analysis
          chrome.runtime.sendMessage({
            action: 'analyzeCode',
            data: { files: response.files }
          });
        } else {
          throw new Error(response?.error || 'Could not get code from PR. Please make sure you are on a GitHub PR page and the PR contains modified files.');
        }
      } catch (error) {
        console.error('Error:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('risks').innerHTML = 
          `<div>Error: ${error.message}</div>`;
      }
    });
    
    // Listen for analysis completion
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      if (request.action === 'analysisComplete') {
        document.getElementById('loading').style.display = 'none';
        // Store both the results and the URL where they were generated
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          const currentUrl = tabs[0]?.url || '';
          chrome.storage.local.set({
            securityData: request.data,
            lastAnalyzedUrl: currentUrl
          });
          updateUI(request.data);
        });
      }
    });

    // Theme toggle functionality
    const themeToggle = document.getElementById('theme-toggle');
    
    // Load saved theme preference
    chrome.storage.local.get(['theme'], function(result) {
        if (result.theme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            themeToggle.checked = true;
        }
    });

    // Handle theme toggle
    themeToggle.addEventListener('change', function() {
        const theme = this.checked ? 'dark' : 'light';
        document.body.setAttribute('data-theme', theme);
        chrome.storage.local.set({ theme: theme });
    });
  });
  
  function updateUI(data) {
    // Update score
    document.getElementById('score').textContent = data.score;
    
    // Update file count
    document.getElementById('file-count').textContent = 
      `Analyzed ${data.fileCount} files`;
    
    // Clear existing risks
    const risksContainer = document.getElementById('risks');
    risksContainer.innerHTML = '';
    
    // Add each issue category
    if (data.issues && data.issues.length > 0) {
      // Group issues by category
      const issuesByCategory = {};
      data.issues.forEach(issue => {
        const category = issue.title || 'Unknown';
        if (!issuesByCategory[category]) {
          issuesByCategory[category] = [];
        }
        issuesByCategory[category].push(issue);
      });
      
      // Add each category and its issues
      for (const [category, issues] of Object.entries(issuesByCategory)) {
        const categoryHeader = document.createElement('div');
        categoryHeader.className = 'risk-title';
        categoryHeader.textContent = `${category} (${issues.length})`;
        risksContainer.appendChild(categoryHeader);
        
        // Add each issue
        issues.forEach(issue => {
          const riskItem = document.createElement('div');
          riskItem.className = 'risk-item';
          
          const riskHeader = document.createElement('div');
          riskHeader.className = 'risk-header';
          riskHeader.textContent = `Potential ${issue.title} risk`;
          
          const fileDetail = document.createElement('div');
          fileDetail.className = 'risk-details';
          fileDetail.textContent = `File: ${issue.file}`;
          
          const severityDetail = document.createElement('div');
          severityDetail.className = 'risk-details';
          severityDetail.textContent = `Severity: ${issue.severity}/10`;
          
          const descriptionDetail = document.createElement('div');
          descriptionDetail.className = 'risk-details';
          descriptionDetail.textContent = issue.description || 'No description available';
          
          riskItem.appendChild(riskHeader);
          riskItem.appendChild(fileDetail);
          riskItem.appendChild(severityDetail);
          riskItem.appendChild(descriptionDetail);
          
          risksContainer.appendChild(riskItem);
        });
      }
    } else {
      risksContainer.innerHTML = '<div>No security issues detected!</div>';
    }
  }
  