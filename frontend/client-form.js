// Check if user is logged in
document.addEventListener('DOMContentLoaded', function() {
    if (!sessionStorage.getItem('isLoggedIn')) {
        window.location.href = 'index.html';
        return;
    }
    
    // Set current time
    const timeElement = document.getElementById('currentTime');
    if (timeElement) {
        timeElement.textContent = new Date().toLocaleTimeString();
    }
    
    initializeAudioInterface();
});

// Global variables
let isListening = false;
let recognition = null;
let synthesis = window.speechSynthesis;
let clientData = {};
let speechTimeout = null;
let currentTranscript = '';
let isProcessing = false;
let conversationActive = false;

// Initialize audio interface
function initializeAudioInterface() {
    console.log('🚀 Initializing audio interface...');
    
    const clientForm = document.getElementById('clientForm');
    const audioInterface = document.getElementById('audioInterface');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    // Check browser support
    if (!checkBrowserSupport()) {
        showError('Your browser does not support speech recognition. Please use Chrome, Edge, or Safari.');
        return;
    }
    
    // Initialize Speech Recognition
    setupSpeechRecognition();
    
    // Handle form submission
    clientForm.addEventListener('submit', function(e) {
        e.preventDefault();
        console.log('📝 Form submitted');
        
        // Collect client data
        clientData = {
            name: document.getElementById('clientName').value,
            mobile: document.getElementById('mobileNumber').value,
            totalDue: parseFloat(document.getElementById('totalDue').value),
            emiAmount: parseFloat(document.getElementById('emiAmount').value),
            dueDate: document.getElementById('dueDate').value
        };
        
        console.log('👤 Client data collected:', clientData);
        
        // Save client data to API
        saveClientData(clientData)
            .then(() => {
                showSuccess('Client data saved successfully');
                // Show audio interface
                audioInterface.style.display = 'block';
                // Start the AI conversation
                startAIConversation();
            })
            .catch(error => {
                console.error('❌ Error saving client data:', error);
                showError('Failed to save client data, but continuing with local data');
                // Show audio interface anyway
                audioInterface.style.display = 'block';
                // Start the AI conversation
                startAIConversation();
            });
    });
    
    // Audio control handlers
    if (startBtn && stopBtn) {
        startBtn.addEventListener('click', function() {
            console.log('🎤 Start button clicked');
            startListening();
        });
        
        stopBtn.addEventListener('click', function() {
            console.log('🛑 Stop button clicked');
            stopListening();
        });
    }
    
    // Test microphone button
    const testMicBtn = document.getElementById('testMicBtn');
    if (testMicBtn) {
        testMicBtn.addEventListener('click', function() {
            console.log('🧪 Test microphone button clicked');
            testMicrophone();
        });
    }
}

// Check browser support for speech recognition
function checkBrowserSupport() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

// Setup speech recognition
function setupSpeechRecognition() {
    console.log('🎤 Setting up speech recognition...');
    
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
    } else if ('SpeechRecognition' in window) {
        recognition = new SpeechRecognition();
    } else {
        console.error('❌ Speech recognition not supported');
        return;
    }
    
    // Configure recognition
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    // Event handlers
    recognition.onstart = function() {
        console.log('✅ Speech recognition started');
        updateStatus('listening', 'Listening...');
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        currentTranscript = '';
    };
    
    recognition.onresult = function(event) {
        let interimTranscript = '';
        let finalTranscript = '';
        
        console.log('🎤 Speech recognition result event triggered');
        
        // Process all results
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            console.log(`🗣️ Result ${i}: "${transcript}" (Final: ${event.results[i].isFinal})`);
            
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        
        // Update current transcript
        if (finalTranscript) {
            currentTranscript += finalTranscript;
            console.log('✅ Final transcript added:', finalTranscript);
            console.log('📝 Complete current transcript:', currentTranscript);
            
            // Process immediately when we get final results
            if (currentTranscript.trim() && !isProcessing) {
                console.log('🔄 Processing final transcript immediately:', currentTranscript.trim());
                processUserSpeech(currentTranscript.trim());
                return; // Don't set timeout if we're processing immediately
            }
        }
        
        // Show interim results
        if (interimTranscript) {
            updateStatus('listening', `Listening... "${interimTranscript}"`);
            console.log('👂 Interim transcript:', interimTranscript);
        }
        
        // Clear existing timeout
        if (speechTimeout) {
            clearTimeout(speechTimeout);
        }
        
        // Only set timeout for interim results or if we have accumulated transcript
        if (currentTranscript.trim() && !isProcessing) {
            speechTimeout = setTimeout(() => {
                if (currentTranscript.trim() && !isProcessing) {
                    console.log('⏰ Timeout triggered - processing transcript:', currentTranscript.trim());
                    processUserSpeech(currentTranscript.trim());
                }
            }, 3000); // Increased to 3 seconds for better pause detection
        }
    };
    
    recognition.onerror = function(event) {
        console.error('❌ Speech recognition error:', event.error);
        
        // Handle specific errors
        if (event.error === 'not-allowed') {
            showError('Microphone access denied. Please allow microphone access and try again.');
            stopListening();
        } else if (event.error === 'no-speech') {
            console.log('⚠️ No speech detected, continuing...');
            // Don't show error for no-speech, just continue
        } else if (event.error === 'network') {
            showError('Network error occurred. Please check your connection.');
        } else {
            showError('Speech recognition error: ' + event.error);
        }
    };
    
    recognition.onend = function() {
        console.log('🔚 Speech recognition ended');
        
        if (isListening && !isProcessing) {
            // Restart recognition automatically
            setTimeout(() => {
                if (isListening && !isProcessing) {
                    try {
                        console.log('🔄 Restarting speech recognition');
                        recognition.start();
                    } catch (error) {
                        console.error('❌ Error restarting recognition:', error);
                        if (error.name !== 'InvalidStateError') {
                            updateStatus('idle', 'Recognition stopped');
                            document.getElementById('startBtn').disabled = false;
                            document.getElementById('stopBtn').disabled = true;
                            isListening = false;
                        }
                    }
                }
            }, 100);
        } else {
            updateStatus('idle', 'Stopped listening');
            document.getElementById('startBtn').disabled = false;
            document.getElementById('stopBtn').disabled = true;
        }
    };
    
    console.log('✅ Speech recognition setup complete');
}

async function saveClientData(data) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/clients`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`Failed to save client data: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call to save client data failed:', error);
        throw error;
    }
}

function startAIConversation() {
    const greeting = generateGreeting();
    addMessageToLog('ai', greeting);
    speakText(greeting);
    
    // Auto-start listening after greeting
    setTimeout(() => {
        if (!isListening) {
            startListening();
        }
    }, 3000);
}

function generateGreeting() {
    const dueDate = new Date(clientData.dueDate);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    let greeting = `Hello ${clientData.name}, this is an automated reminder from your loan service provider. `;
    
    if (daysUntilDue > 0) {
        greeting += `Your EMI of ₹${clientData.emiAmount} is due in ${daysUntilDue} days on ${dueDate.toLocaleDateString()}. `;
    } else if (daysUntilDue === 0) {
        greeting += `Your EMI of ₹${clientData.emiAmount} is due today. `;
    } else {
        greeting += `Your EMI of ₹${clientData.emiAmount} was due ${Math.abs(daysUntilDue)} days ago. `;
    }
    
    greeting += `Your current outstanding amount is ₹${clientData.totalDue}. How can I assist you today?`;
    
    return greeting;
}

function processUserInput(input) {
    console.log('🔄 Processing user input:', input);
    
    // Try to use API for enhanced responses, fallback to local responses
    processWithAPI(input)
        .then(response => {
            addMessageToLog('ai', response);
            speakText(response);
        })
        .catch(error => {
            console.error('API error, using fallback:', error);
            // Fallback to local response generation
            const response = generateResponse(input.toLowerCase());
            addMessageToLog('ai', response);
            speakText(response);
        })
        .finally(() => {
            // Reset processing flag after a delay
            setTimeout(() => {
                isProcessing = false;
                if (isListening) {
                    updateStatus('listening', 'Listening...');
                }
            }, 1000);
        });
}

async function processWithAPI(input) {
    try {
        // Use the new voice chat endpoint for better speech recognition support
        const response = await fetch(`${API_BASE_URL}/api/chat/voice`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                transcript: input,
                clientData: clientData,
                sessionId: generateSessionId(),
                confidence: 0.9 // High confidence since we processed the speech
            })
        });
        
        if (!response.ok) {
            console.error('Voice API failed, falling back to regular chat');
            // Fallback to regular chat endpoint
            const fallbackResponse = await fetch(`${API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: input,
                    clientData: clientData,
                    sessionId: generateSessionId()
                })
            });
            
            if (!fallbackResponse.ok) {
                throw new Error(`Both API endpoints failed: ${response.status}, ${fallbackResponse.status}`);
            }
            
            const fallbackData = await fallbackResponse.json();
            return fallbackData.response || generateResponse(input.toLowerCase());
        }
        
        const data = await response.json();
        return data.response || generateResponse(input.toLowerCase());
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Process user speech (main function called after pause detection)
function processUserSpeech(transcript) {
    if (isProcessing) {
        console.log('⚠️ Already processing, ignoring new transcript');
        return;
    }
    
    console.log('🎯 processUserSpeech called with:', transcript);
    
    // Send debug info to backend
    sendSpeechDebugInfo(transcript, 0.9, true);
    
    isProcessing = true;
    updateStatus('processing', 'Processing...');
    
    // Add user message to log
    addMessageToLog('user', transcript);
    
    // Clear current transcript
    currentTranscript = '';
    
    // Clear any pending timeout
    if (speechTimeout) {
        clearTimeout(speechTimeout);
        speechTimeout = null;
    }
    
    // Process the input
    processUserInput(transcript);
}

// Send speech debug information to backend
async function sendSpeechDebugInfo(transcript, confidence, isFinal) {
    try {
        await fetch(`${API_BASE_URL}/api/speech/debug`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                transcript: transcript,
                confidence: confidence,
                isFinal: isFinal,
                timestamp: new Date().toISOString(),
                clientName: clientData.name || 'Unknown'
            })
        });
    } catch (error) {
        console.log('Debug info send failed (non-critical):', error);
    }
}

function generateResponse(input) {
    // Payment-related responses
    if (input.includes('paid') || input.includes('payment') || input.includes('pay')) {
        return `Thank you for confirming your payment, ${clientData.name}. Please ensure the payment is processed before the due date. Is there anything else I can help you with regarding your loan?`;
    }
    
    // Balance inquiry
    if (input.includes('balance') || input.includes('outstanding') || input.includes('due amount')) {
        return `Your current outstanding loan amount is ₹${clientData.totalDue}. Your next EMI of ₹${clientData.emiAmount} is due on ${new Date(clientData.dueDate).toLocaleDateString()}.`;
    }
    
    // EMI amount inquiry
    if (input.includes('emi') || input.includes('installment')) {
        return `Your monthly EMI amount is ₹${clientData.emiAmount}. The due date for your next payment is ${new Date(clientData.dueDate).toLocaleDateString()}.`;
    }
    
    // Extension request
    if (input.includes('extension') || input.includes('extend') || input.includes('delay')) {
        return `I understand you're requesting an extension, ${clientData.name}. Please contact our customer service at 1800-123-4567 for payment extension requests. They will be able to assist you with the necessary arrangements.`;
    }
    
    // General help
    if (input.includes('help') || input.includes('support')) {
        return `I can help you with information about your loan balance, EMI amount, due dates, and payment confirmations, ${clientData.name}. For other queries, please contact our customer service at 1800-123-4567.`;
    }
    
    // Goodbye
    if (input.includes('bye') || input.includes('goodbye') || input.includes('thank you')) {
        return `Thank you for your time, ${clientData.name}. Please remember to make your EMI payment of ₹${clientData.emiAmount} by ${new Date(clientData.dueDate).toLocaleDateString()}. Have a great day!`;
    }
    
    // Default response
    return `I understand your concern, ${clientData.name}. For detailed assistance with your loan account, please contact our customer service at 1800-123-4567. Is there anything specific about your EMI or payment that I can help clarify?`;
}

async function speakText(text) {
    console.log('🗣️ Speaking text:', text.substring(0, 50) + '...');
    updateStatus('speaking', 'Speaking...');
    
    // Temporarily stop listening while speaking
    const wasListening = isListening;
    if (isListening) {
        isListening = false;
        if (recognition) {
            try {
                recognition.stop();
            } catch (error) {
                console.error('Error stopping recognition for speech:', error);
            }
        }
    }
    
    try {
        // Try to use AWS Polly through API first
        const audioUrl = await getPollyAudio(text);
        if (audioUrl) {
            await playAudioFromUrl(audioUrl);
            // Resume listening after speech completes
            if (wasListening) {
                setTimeout(() => {
                    if (!isProcessing) {
                        updateStatus('listening', 'Listening...');
                        startListening();
                    }
                }, 500);
            } else {
                updateStatus('idle', 'Ready');
            }
            return;
        }
    } catch (error) {
        console.error('AWS Polly error, falling back to browser TTS:', error);
    }
    
    // Fallback to browser's built-in speech synthesis
    return new Promise((resolve) => {
        // Stop any ongoing speech
        synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        // Try to use a more natural voice if available
        const voices = synthesis.getVoices();
        const preferredVoice = voices.find(voice => 
            voice.name.includes('Joanna') || 
            voice.name.includes('Neural') || 
            voice.name.includes('Premium') ||
            (voice.lang === 'en-US' && voice.name.includes('Female'))
        );
        
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        utterance.onend = function() {
            console.log('✅ Speech synthesis completed');
            // Resume listening if it was active before
            if (wasListening) {
                setTimeout(() => {
                    if (!isProcessing) {
                        updateStatus('listening', 'Listening...');
                        startListening();
                    }
                }, 500);
            } else {
                updateStatus('idle', 'Ready');
            }
            resolve();
        };
        
        utterance.onerror = function(event) {
            console.error('❌ Speech synthesis error:', event);
            // Resume listening if it was active before
            if (wasListening) {
                setTimeout(() => {
                    if (!isProcessing) {
                        updateStatus('listening', 'Listening...');
                        startListening();
                    }
                }, 500);
            } else {
                updateStatus('idle', 'Ready');
            }
            resolve();
        };
        
        synthesis.speak(utterance);
    });
}

async function getPollyAudio(text) {
    try {
        console.log('🎵 Attempting AWS Polly synthesis for:', text.substring(0, 50) + '...');
        console.log('🔗 API URL:', `${API_BASE_URL}/api/polly/synthesize`);
        
        const response = await fetch(`${API_BASE_URL}/api/polly/synthesize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text,
                voiceId: 'Kajal',
                outputFormat: 'mp3'
            })
        });
        
        console.log('📡 Polly API Response Status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Polly API Error Response:', errorText);
            throw new Error(`Polly API response not ok: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        console.log('✅ Polly API Success:', data.success);
        
        if (data.success && data.audioUrl) {
            console.log('🎵 AWS Polly audio URL received, length:', data.audioUrl.length);
            return data.audioUrl;
        } else {
            throw new Error('Invalid Polly response format');
        }
    } catch (error) {
        console.error('❌ Polly API call failed:', error);
        throw error;
    }
}

function playAudioFromUrl(audioUrl) {
    return new Promise((resolve, reject) => {
        const audio = new Audio(audioUrl);
        
        audio.onended = function() {
            console.log('✅ AWS Polly audio playback completed');
            resolve();
        };
        
        audio.onerror = function(error) {
            console.error('❌ Audio playback error:', error);
            reject(error);
        };
        
        audio.play().catch(error => {
            console.error('❌ Audio play failed:', error);
            reject(error);
        });
    });
}

function startListening() {
    console.log('🎤 Starting listening...');
    
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    if (!recognition) {
        showError('Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.');
        return;
    }
    
    // Stop any existing recognition
    if (isListening) {
        stopListening();
        setTimeout(startListening, 500);
        return;
    }
    
    console.log('🎤 Requesting microphone permission...');
    
    // Request microphone permission explicitly
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(stream) {
            console.log('✅ Microphone access granted');
            // Permission granted, start recognition
            isListening = true;
            isProcessing = false;
            currentTranscript = '';
            
            // Stop the stream as we don't need it anymore
            stream.getTracks().forEach(track => track.stop());
            
            try {
                recognition.start();
                console.log('🎤 Speech recognition started successfully');
            } catch (error) {
                console.error('❌ Speech recognition start error:', error);
                if (error.name === 'InvalidStateError') {
                    // Recognition is already running, stop and restart
                    console.log('🔄 Recognition already running, restarting...');
                    recognition.stop();
                    setTimeout(() => {
                        try {
                            recognition.start();
                        } catch (e) {
                            console.error('❌ Failed to restart recognition:', e);
                            showError('Failed to start speech recognition: ' + e.message);
                            isListening = false;
                            if (startBtn) startBtn.disabled = false;
                            if (stopBtn) stopBtn.disabled = true;
                        }
                    }, 500);
                } else {
                    showError('Failed to start speech recognition: ' + error.message);
                    isListening = false;
                    if (startBtn) startBtn.disabled = false;
                    if (stopBtn) stopBtn.disabled = true;
                }
            }
        })
        .catch(function(error) {
            console.error('❌ Microphone access denied:', error);
            showError('Microphone access is required for voice interaction. Please allow microphone access and try again.');
            if (startBtn) startBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = true;
        });
}

function stopListening() {
    console.log('🛑 Stopping listening...');
    
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    
    isListening = false;
    isProcessing = false;
    
    // Clear any pending timeouts
    if (speechTimeout) {
        clearTimeout(speechTimeout);
        speechTimeout = null;
    }
    
    // Stop recognition
    if (recognition) {
        try {
            recognition.stop();
        } catch (error) {
            console.error('❌ Error stopping recognition:', error);
        }
    }
    
    // Update UI
    updateStatus('idle', 'Stopped');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    
    console.log('✅ Listening stopped');
}

function updateStatus(status, text) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (statusDot && statusText) {
        statusDot.className = `status-dot status-${status}`;
        statusText.textContent = text;
    }
}

function addMessageToLog(sender, message) {
    const conversationLog = document.getElementById('conversationLog');
    if (!conversationLog) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const currentTime = new Date().toLocaleTimeString();
    messageDiv.innerHTML = `
        <div>${message}</div>
        <div class="message-time">${currentTime}</div>
    `;
    
    conversationLog.appendChild(messageDiv);
    conversationLog.scrollTop = conversationLog.scrollHeight;
}

function showError(message) {
    console.error('🚨 Error:', message);
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

function showSuccess(message) {
    console.log('✅ Success:', message);
    const successDiv = document.getElementById('successMessage');
    if (successDiv) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        
        setTimeout(() => {
            successDiv.style.display = 'none';
        }, 5000);
    }
}

// Test microphone function
function testMicrophone() {
    console.log('🧪 Testing microphone access...');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('Your browser does not support microphone access. Please use Chrome, Edge, or Safari.');
        return;
    }
    
    updateStatus('processing', 'Testing microphone...');
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function(stream) {
            console.log('✅ Microphone test successful');
            showSuccess('Microphone access granted! You can now use voice features.');
            updateStatus('idle', 'Microphone test passed');
            
            // Stop the stream
            stream.getTracks().forEach(track => track.stop());
            
            // Test speech recognition if available
            if (checkBrowserSupport()) {
                showSuccess('Speech recognition is supported in your browser.');
            } else {
                showError('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
            }
        })
        .catch(function(error) {
            console.error('❌ Microphone test failed:', error);
            updateStatus('idle', 'Microphone test failed');
            
            if (error.name === 'NotAllowedError') {
                showError('Microphone access denied. Please click the microphone icon in your browser address bar and allow access.');
            } else if (error.name === 'NotFoundError') {
                showError('No microphone found. Please connect a microphone and try again.');
            } else if (error.name === 'NotReadableError') {
                showError('Microphone is being used by another application. Please close other apps and try again.');
            } else {
                showError('Microphone test failed: ' + error.message);
            }
        });
}

function logout() {
    sessionStorage.clear();
    window.location.href = 'index.html';
}

// Set current time on page load
document.addEventListener('DOMContentLoaded', function() {
    const timeElement = document.getElementById('currentTime');
    if (timeElement) {
        timeElement.textContent = new Date().toLocaleTimeString();
    }
});
