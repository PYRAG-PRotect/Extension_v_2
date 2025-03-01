// Import our Gemini API implementation
importScripts('gemini-api.js');

const SYSTEM_PROMPT = `You are a security-focused AI that analyzes code for vulnerabilities, assigns a severity score (0-10), and provides fixes. Detect and mitigate the following:

SQL Injection – Detect unsanitized user input in queries. Use parameterized queries.
Command Injection – Identify user-controlled system commands. Use safe execution methods.
Insecure Configuration – Find misconfigurations in security settings. Suggest best practices.
XSS (Cross-Site Scripting) – Detect unescaped user input in HTML. Use escaping & CSP.
Unsafe Deserialization – Identify untrusted deserialization. Recommend secure methods.
Malicious Packages – Detect known malicious dependencies. Suggest alternatives.
Crypto Mining – Identify unauthorized mining scripts. Recommend mitigation.
Data Exfiltration – Find unauthorized data transfers. Suggest monitoring & access control.
Obfuscated Code – Detect encoded or misleading code. Recommend clarity.
Suspicious URLs – Identify hardcoded/phishing URLs. Suggest validation.
Hardcoded IPs – Detect embedded IPs. Recommend environment variables.
Debug Code – Find sensitive logs & debug statements. Suggest secure logging.
SSRF (Server-Side Request Forgery) – Detect unvalidated external requests. Use allowlists.
Backdoors – Identify unauthorized access points. Recommend removal.
Privilege Escalation – Detect improper access control. Recommend least privilege principles.
Response Format:
Title: Vulnerability Name
Severity Score: (0-10)
Description: Brief explanation
File: File name
Code Review: Highlight issue
Fix: Secure solution
- **Summary**: Total risk score and overall risk level.

Example response:
**Title:** SQL Injection
**Severity Score:** 9
**Description:** The get_user_data function constructs an SQL query using string concatenation with user-supplied input, making it vulnerable to SQL injection attacks. An attacker can inject malicious SQL code to bypass authentication, extract sensitive data, or even modify the database.
**File:** main.py
**Code Review:**
query = f"SELECT * FROM users WHERE username = '{user_input}'"  # SQL Injection risk
cursor.execute(query)
**Fix:** Use parameterized queries to prevent SQL injection. This separates the SQL code from the user-provided data.
def get_user_data(user_input):
    conn = sqlite3.connect("users.db")
    cursor = conn.cursor()
    query = "SELECT * FROM users WHERE username = ?"
    cursor.execute(query, (user_input,))
    return cursor.fetchall()
`;


// Remove the hardcoded API key and just initialize storage
chrome.storage.local.set({ geminiApiKey: "AIzaSyCI8J0vGyBOAo4ibSOCcpE4gdyqP-EDY20" });

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'analyzeCode') {
    analyzeSecurityIssues(request.data.files)
      .then(result => {
        // Store results and notify popup
        chrome.storage.local.set({securityData: result});
        chrome.runtime.sendMessage({
          action: 'analysisComplete', 
          data: result
        });
      })
      .catch(error => {
        console.error('Error analyzing code:', error);
        chrome.runtime.sendMessage({
          action: 'analysisComplete', 
          data: { 
            score: 0, 
            fileCount: Object.keys(request.data.files).length, 
            issues: [{
              title: 'Analysis Error',
              severity: 0,
              description: error.message || 'An error occurred during analysis',
              file: 'N/A'
            }]
          }
        });
      });
  }
  return true;
});

async function analyzeSecurityIssues(files) {
  try {
    // Prepare code for analysis
    let codeForAnalysis = '';
    for (const [filePath, code] of Object.entries(files)) {
      codeForAnalysis += `File: ${filePath}\n\n${code}\n\n---\n\n`;
    }

    // Get API key from storage
    const apiKeyResult = await chrome.storage.local.get(['geminiApiKey']);
    const apiKey = apiKeyResult.geminiApiKey;

    if (!apiKey) {
      throw new Error('Gemini API key not found');
    }

    console.log('Initializing Gemini...');
    const genAI = new GoogleGenerativeAI(apiKey);

    // Get the model
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    // Set generation config
    const generationConfig = {
      temperature: 1,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 8192,
      responseMimeType: "text/plain",
    };

    // Start chat session
    const chatSession = model.startChat({
      generationConfig,
      history: [],
    });

    console.log('Sending code for analysis...');
    const result = await chatSession.sendMessage(codeForAnalysis);
    console.log('AI response received');
    const generatedText = result.response.text();
    
    // Parse the response
    const issues = parseResponse(generatedText);
    
    // Calculate overall score
    const totalSeverity = issues.reduce((sum, issue) => sum + issue.severity, 0);
    const score = issues.length > 0 
      ? Math.max(0, 100 - Math.round((totalSeverity / issues.length) * 10))
      : 100;
    
    return {
      score: score,
      fileCount: Object.keys(files).length,
      issues: issues
    };
  } catch (error) {
    console.error('Error in analyzeSecurityIssues:', error);
    throw error;
  }
}

function parseResponse(text) {
  const issues = [];
  let currentIssue = {};
  let inCodeReview = false;
  let inFix = false;
  
  const lines = text.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('**Title:**')) {
      // If we have a previous issue, save it before starting new one
      if (currentIssue.title) {
        issues.push({...currentIssue});
      }
      currentIssue = {};
      currentIssue.title = line.replace('**Title:**', '').trim();
      inCodeReview = false;
      inFix = false;
    } 
    else if (line.startsWith('**Severity Score:**')) {
      currentIssue.severity = parseInt(line.replace('**Severity Score:**', '').trim());
    }
    else if (line.startsWith('**Description:**')) {
      currentIssue.description = line.replace('**Description:**', '').trim();
    }
    else if (line.startsWith('**File:**')) {
      currentIssue.file = line.replace('**File:**', '').trim();
    }
    else if (line.startsWith('**Code Review:**')) {
      inCodeReview = true;
      inFix = false;
      currentIssue.codeReview = '';
    }
    else if (line.startsWith('**Fix:**')) {
      inCodeReview = false;
      inFix = true;
      currentIssue.fix = '';
    }
    else if (inCodeReview) {
      if (currentIssue.codeReview) {
        currentIssue.codeReview += '\n' + line;
      } else {
        currentIssue.codeReview = line;
      }
    }
    else if (inFix) {
      if (currentIssue.fix) {
        currentIssue.fix += '\n' + line;
      } else {
        currentIssue.fix = line;
      }
    }
  }
  
  // Don't forget to add the last issue
  if (currentIssue.title) {
    issues.push({...currentIssue});
  }
  
  return issues;
}
