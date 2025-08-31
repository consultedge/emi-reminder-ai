const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');

// Configure AWS services
AWS.config.update({
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

const polly = new AWS.Polly();
const transcribe = new AWS.TranscribeService();
const lexruntime = new AWS.LexRuntime();
const comprehend = new AWS.Comprehend();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Debug middleware to log all requests
app.use((req, res, next) => {
    console.log('🔍 Request Debug:', {
        method: req.method,
        path: req.path,
        url: req.url,
        originalUrl: req.originalUrl,
        baseUrl: req.baseUrl,
        headers: {
            'user-agent': req.headers['user-agent'],
            'content-type': req.headers['content-type'],
            'origin': req.headers.origin
        },
        body: req.body
    });
    next();
});

// In-memory storage (replace with database in production)
let clients = [];
let conversations = [];

// Enhanced AI response generation with sentiment analysis
function generateEnhancedAIResponse(input, clientData, sentiment) {
    const isNegative = sentiment === 'NEGATIVE';
    const isPositive = sentiment === 'POSITIVE';
    
    // Payment-related responses
    if (input.includes('paid') || input.includes('payment') || input.includes('pay')) {
        if (isPositive) {
            return `Wonderful! Thank you for confirming your payment, ${clientData.name}. I'm glad to hear you've taken care of this. Please ensure the payment is processed before the due date. Is there anything else I can help you with regarding your loan?`;
        }
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
        if (isNegative) {
            return `I understand you're facing difficulties, ${clientData.name}. Don't worry, we're here to help. Please contact our customer service at 1800-123-4567 for payment extension requests. They will work with you to find a suitable arrangement.`;
        }
        return `I understand you're requesting an extension. Please contact our customer service at 1800-123-4567 for payment extension requests. They will be able to assist you with the necessary arrangements.`;
    }
    
    // Financial difficulty
    if (input.includes('difficult') || input.includes('problem') || input.includes('cannot') || input.includes('unable')) {
        return `I understand you're facing some challenges, ${clientData.name}. We want to help you through this. Please contact our customer service at 1800-123-4567 immediately. They have various assistance programs and can work out a payment plan that suits your situation.`;
    }
    
    // General help
    if (input.includes('help') || input.includes('support')) {
        return `I'm here to help you, ${clientData.name}. I can provide information about your loan balance, EMI amount, due dates, and payment confirmations. For other queries, please contact our customer service at 1800-123-4567.`;
    }
    
    // Goodbye
    if (input.includes('bye') || input.includes('goodbye') || input.includes('thank you')) {
        if (isPositive) {
            return `It was my pleasure helping you today, ${clientData.name}! Please remember to make your EMI payment of ₹${clientData.emiAmount} by ${new Date(clientData.dueDate).toLocaleDateString()}. Have a wonderful day!`;
        }
        return `Thank you for your time, ${clientData.name}. Please remember to make your EMI payment of ₹${clientData.emiAmount} by ${new Date(clientData.dueDate).toLocaleDateString()}. Have a great day!`;
    }
    
    // Default response with sentiment consideration
    if (isNegative) {
        return `I understand your concern, ${clientData.name}, and I want to help resolve this for you. For detailed assistance with your loan account, please contact our customer service at 1800-123-4567. They're specially trained to handle your specific situation. Is there anything specific about your EMI or payment that I can help clarify right now?`;
    }
    
    return `I understand your concern, ${clientData.name}. For detailed assistance with your loan account, please contact our customer service at 1800-123-4567. Is there anything specific about your EMI or payment that I can help clarify?`;
}

// Helper function to generate AI responses (fallback)
function generateAIResponse(input, clientData) {
    return generateEnhancedAIResponse(input, clientData, 'NEUTRAL');
}

// Add catch-all route to handle proxy path issues
app.use('/api*', (req, res, next) => {
    console.log('🎯 API Route matched:', req.originalUrl);
    next();
});

// Add root level routes to handle different proxy configurations
app.get('/health', (req, res) => {
    console.log('🏥 Root health check accessed');
    res.json({ status: 'OK', message: 'EMI Reminder AI Backend is running (root path)' });
});

app.post('/polly/synthesize', async (req, res) => {
    console.log('🎵 Root Polly endpoint accessed');
    try {
        const { text, voiceId = 'Joanna', outputFormat = 'mp3' } = req.body;
        
        const params = {
            Text: text,
            OutputFormat: outputFormat,
            VoiceId: voiceId,
            Engine: 'neural'
        };
        
        const pollyResult = await polly.synthesizeSpeech(params).promise();
        const audioBase64 = pollyResult.AudioStream.toString('base64');
        
        res.json({
            success: true,
            audioUrl: `data:audio/${outputFormat};base64,${audioBase64}`,
            text: text,
            voiceId: voiceId,
            outputFormat: outputFormat
        });
    } catch (error) {
        console.error('Root Polly synthesis error:', error);
        res.status(500).json({
            success: false,
            message: 'Error synthesizing speech with AWS Polly',
            error: error.message
        });
    }
});

app.post('/clients', (req, res) => {
    console.log('👥 Root clients endpoint accessed');
    try {
        const clientData = {
            id: uuidv4(),
            name: req.body.name,
            mobile: req.body.mobile,
            totalDue: parseFloat(req.body.totalDue),
            emiAmount: parseFloat(req.body.emiAmount),
            dueDate: req.body.dueDate,
            createdAt: new Date().toISOString()
        };
        
        clients.push(clientData);
        
        res.json({
            success: true,
            client: clientData,
            message: 'Client data stored successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error storing client data',
            error: error.message
        });
    }
});

app.post('/chat', async (req, res) => {
    console.log('💬 Root chat endpoint accessed');
    try {
        const { message, clientData, sessionId } = req.body;
        
        // Use fallback AI response for now
        const response = generateEnhancedAIResponse(message.toLowerCase(), clientData, 'NEUTRAL');
        
        res.json({
            success: true,
            response: response,
            timestamp: new Date().toISOString(),
            confidence: 0.8,
            fallback: true
        });
    } catch (error) {
        console.error('Root Chat API Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing chat',
            error: error.message
        });
    }
});

// Routes

// Health check
app.get('/api/health', (req, res) => {
    console.log('🏥 API health check accessed');
    res.json({ status: 'OK', message: 'EMI Reminder AI Backend is running' });
});

// Authentication endpoint
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    // Simple authentication (replace with proper auth in production)
    if (username === 'admin' && password === 'password') {
        res.json({
            success: true,
            token: uuidv4(),
            user: { username: 'admin', role: 'agent' }
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }
});

// Store client data
app.post('/api/clients', (req, res) => {
    try {
        const clientData = {
            id: uuidv4(),
            name: req.body.name,
            mobile: req.body.mobile,
            totalDue: parseFloat(req.body.totalDue),
            emiAmount: parseFloat(req.body.emiAmount),
            dueDate: req.body.dueDate,
            createdAt: new Date().toISOString()
        };
        
        clients.push(clientData);
        
        res.json({
            success: true,
            client: clientData,
            message: 'Client data stored successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error storing client data',
            error: error.message
        });
    }
});

// Get client data
app.get('/api/clients/:id', (req, res) => {
    const client = clients.find(c => c.id === req.params.id);
    
    if (client) {
        res.json({
            success: true,
            client: client
        });
    } else {
        res.status(404).json({
            success: false,
            message: 'Client not found'
        });
    }
});

// Get all clients
app.get('/api/clients', (req, res) => {
    res.json({
        success: true,
        clients: clients,
        count: clients.length
    });
});

// Store conversation data
app.post('/api/conversations', (req, res) => {
    try {
        const conversationData = {
            id: uuidv4(),
            clientId: req.body.clientId,
            messages: req.body.messages || [],
            startTime: req.body.startTime || new Date().toISOString(),
            endTime: req.body.endTime,
            status: req.body.status || 'active',
            createdAt: new Date().toISOString()
        };
        
        conversations.push(conversationData);
        
        res.json({
            success: true,
            conversation: conversationData,
            message: 'Conversation data stored successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error storing conversation data',
            error: error.message
        });
    }
});

// Get conversation data
app.get('/api/conversations/:id', (req, res) => {
    const conversation = conversations.find(c => c.id === req.params.id);
    
    if (conversation) {
        res.json({
            success: true,
            conversation: conversation
        });
    } else {
        res.status(404).json({
            success: false,
            message: 'Conversation not found'
        });
    }
});

// Chat endpoint for frontend integration
app.post('/api/chat', async (req, res) => {
    try {
        const { message, clientData, sessionId } = req.body;
        
        // Use AWS Comprehend for sentiment analysis
        const sentimentParams = {
            Text: message,
            LanguageCode: 'en'
        };
        
        let sentimentResult;
        try {
            sentimentResult = await comprehend.detectSentiment(sentimentParams).promise();
        } catch (error) {
            console.log('Comprehend not available, using neutral sentiment');
            sentimentResult = { Sentiment: 'NEUTRAL', SentimentScore: {} };
        }
        
        // Use AWS Lex for natural language understanding
        const lexParams = {
            botName: process.env.LEX_BOT_NAME || 'EMIReminderBot',
            botAlias: process.env.LEX_BOT_ALIAS || 'PROD',
            userId: sessionId || uuidv4(),
            inputText: message,
            sessionAttributes: {
                clientName: clientData.name,
                emiAmount: clientData.emiAmount.toString(),
                totalDue: clientData.totalDue.toString(),
                dueDate: clientData.dueDate,
                mobile: clientData.mobile
            }
        };
        
        let response;
        try {
            const lexResult = await lexruntime.postText(lexParams).promise();
            response = lexResult.message;
        } catch (lexError) {
            console.log('Lex not available, using fallback AI response');
            // Fallback to enhanced keyword-based response with sentiment
            response = generateEnhancedAIResponse(message.toLowerCase(), clientData, sentimentResult.Sentiment);
        }
        
        res.json({
            success: true,
            response: response,
            timestamp: new Date().toISOString(),
            confidence: 0.95,
            sentiment: sentimentResult.Sentiment,
            sentimentScore: sentimentResult.SentimentScore
        });
    } catch (error) {
        console.error('Chat API Error:', error);
        // Fallback to basic response
        const response = generateAIResponse(req.body.message.toLowerCase(), req.body.clientData);
        
        res.json({
            success: true,
            response: response,
            timestamp: new Date().toISOString(),
            confidence: 0.8,
            fallback: true
        });
    }
});

// AWS Polly synthesis endpoint for frontend
app.post('/api/polly/synthesize', async (req, res) => {
    try {
        const { text, voiceId = 'Joanna', outputFormat = 'mp3' } = req.body;
        
        const params = {
            Text: text,
            OutputFormat: outputFormat,
            VoiceId: voiceId,
            Engine: 'neural' // Use neural engine for more natural speech
        };
        
        const pollyResult = await polly.synthesizeSpeech(params).promise();
        
        // Convert audio stream to base64
        const audioBase64 = pollyResult.AudioStream.toString('base64');
        
        res.json({
            success: true,
            audioUrl: `data:audio/${outputFormat};base64,${audioBase64}`,
            text: text,
            voiceId: voiceId,
            outputFormat: outputFormat
        });
    } catch (error) {
        console.error('Polly synthesis error:', error);
        res.status(500).json({
            success: false,
            message: 'Error synthesizing speech with AWS Polly',
            error: error.message
        });
    }
});

// AWS Transcribe endpoint for frontend speech-to-text
app.post('/api/transcribe/audio', async (req, res) => {
    try {
        const { audioData, language = 'en-US' } = req.body;
        
        // For real-time transcription, we'd use AWS Transcribe Streaming
        // This is a simplified implementation for demo purposes
        const jobName = `transcribe-job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // In a production environment, you would:
        // 1. Upload audio to S3 first
        // 2. Use the S3 URL for transcription
        // 3. For real-time: use AWS Transcribe Streaming API
        
        // For now, we'll simulate the transcription process
        // In reality, you'd need to handle audio blob upload to S3
        
        res.json({
            success: true,
            jobName: jobName,
            status: 'COMPLETED',
            transcript: 'Simulated transcription - integrate with actual AWS Transcribe Streaming API',
            message: 'Note: This is a placeholder. Implement AWS Transcribe Streaming for real-time audio processing.',
            fallback: true
        });
        
    } catch (error) {
        console.error('Transcribe error:', error);
        res.status(500).json({
            success: false,
            message: 'Error transcribing audio with AWS Transcribe',
            error: error.message
        });
    }
});

// Real-time transcription endpoint using AWS Transcribe Streaming
app.post('/api/transcribe/stream', async (req, res) => {
    try {
        // This would implement AWS Transcribe Streaming API
        // For real-time speech-to-text processing
        
        res.json({
            success: true,
            message: 'AWS Transcribe Streaming endpoint - implement WebSocket connection for real-time transcription',
            note: 'This requires WebSocket implementation for streaming audio data'
        });
        
    } catch (error) {
        console.error('Transcribe streaming error:', error);
        res.status(500).json({
            success: false,
            message: 'Error with AWS Transcribe Streaming',
            error: error.message
        });
    }
});

// AI Response endpoint using AWS Lex and Comprehend (legacy endpoint)
app.post('/api/ai/respond', async (req, res) => {
    try {
        const { message, clientData, conversationContext, sessionId } = req.body;
        
        // Use AWS Comprehend for sentiment analysis
        const sentimentParams = {
            Text: message,
            LanguageCode: 'en'
        };
        
        const sentimentResult = await comprehend.detectSentiment(sentimentParams).promise();
        
        // Use AWS Lex for natural language understanding
        const lexParams = {
            botName: process.env.LEX_BOT_NAME || 'EMIReminderBot',
            botAlias: process.env.LEX_BOT_ALIAS || 'PROD',
            userId: sessionId || uuidv4(),
            inputText: message,
            sessionAttributes: {
                clientName: clientData.name,
                emiAmount: clientData.emiAmount.toString(),
                totalDue: clientData.totalDue.toString(),
                dueDate: clientData.dueDate,
                mobile: clientData.mobile
            }
        };
        
        let response;
        try {
            const lexResult = await lexruntime.postText(lexParams).promise();
            response = lexResult.message;
        } catch (lexError) {
            console.log('Lex not available, using fallback AI response');
            // Fallback to enhanced keyword-based response with sentiment
            response = generateEnhancedAIResponse(message.toLowerCase(), clientData, sentimentResult.Sentiment);
        }
        
        res.json({
            success: true,
            response: {
                text: response,
                timestamp: new Date().toISOString(),
                confidence: 0.95,
                sentiment: sentimentResult.Sentiment,
                sentimentScore: sentimentResult.SentimentScore
            }
        });
    } catch (error) {
        console.error('AI Response Error:', error);
        // Fallback to basic response
        const response = generateAIResponse(req.body.message.toLowerCase(), req.body.clientData);
        
        res.json({
            success: true,
            response: {
                text: response,
                timestamp: new Date().toISOString(),
                confidence: 0.8,
                fallback: true
            }
        });
    }
});

// Text-to-Speech endpoint using AWS Polly
app.post('/api/tts/synthesize', async (req, res) => {
    try {
        const { text, voice = 'Joanna', language = 'en-US' } = req.body;
        
        const params = {
            Text: text,
            OutputFormat: 'mp3',
            VoiceId: voice,
            LanguageCode: language,
            Engine: 'neural' // Use neural engine for more natural speech
        };
        
        const pollyResult = await polly.synthesizeSpeech(params).promise();
        
        // Convert audio stream to base64
        const audioBase64 = pollyResult.AudioStream.toString('base64');
        
        res.json({
            success: true,
            audioData: `data:audio/mp3;base64,${audioBase64}`,
            text: text,
            voice: voice,
            language: language,
            duration: Math.ceil(text.length / 10) // Estimated duration
        });
    } catch (error) {
        console.error('Polly TTS Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error synthesizing speech with AWS Polly',
            error: error.message,
            fallback: true
        });
    }
});

// Speech-to-Text endpoint using AWS Transcribe
app.post('/api/stt/transcribe', async (req, res) => {
    try {
        const { audioData, language = 'en-US' } = req.body;
        
        // For real-time transcription, we'd use AWS Transcribe Streaming
        // This is a simplified version - in production, you'd handle audio streaming
        const jobName = `transcribe-job-${Date.now()}`;
        
        const params = {
            TranscriptionJobName: jobName,
            LanguageCode: language,
            MediaFormat: 'wav',
            Media: {
                MediaFileUri: audioData // This would be an S3 URL in production
            }
        };
        
        // Start transcription job
        const transcribeResult = await transcribe.startTranscriptionJob(params).promise();
        
        // In production, you'd poll for job completion or use streaming
        // For demo purposes, return a success response
        res.json({
            success: true,
            jobName: jobName,
            status: 'IN_PROGRESS',
            message: 'Transcription job started. Use /api/stt/status/:jobName to check status'
        });
        
    } catch (error) {
        console.error('Transcribe STT Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error transcribing speech with AWS Transcribe',
            error: error.message
        });
    }
});

// Get transcription job status
app.get('/api/stt/status/:jobName', async (req, res) => {
    try {
        const { jobName } = req.params;
        
        const params = {
            TranscriptionJobName: jobName
        };
        
        const result = await transcribe.getTranscriptionJob(params).promise();
        
        res.json({
            success: true,
            status: result.TranscriptionJob.TranscriptionJobStatus,
            transcript: result.TranscriptionJob.Transcript ? result.TranscriptionJob.Transcript.TranscriptFileUri : null
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error getting transcription status',
            error: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`EMI Reminder AI Backend running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
