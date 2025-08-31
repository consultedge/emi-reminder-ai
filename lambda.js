const AWS = require('aws-sdk');

// Configure AWS services
AWS.config.update({
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

const polly = new AWS.Polly();
const comprehend = new AWS.Comprehend();
const lexruntime = new AWS.LexRuntime();
const transcribe = new AWS.TranscribeService();
const bedrock = new AWS.BedrockRuntime();
const s3 = new AWS.S3();

// In-memory storage
let clients = [];
let conversations = [];

// Enhanced AI response generation with sentiment analysis
function generateEnhancedAIResponse(input, clientData, sentiment = 'NEUTRAL') {
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

// LLM Integration for Enhanced Debt Collection Responses
async function generateLLMResponse(userInput, clientData, lexIntent, lexResponse, sentiment) {
    try {
        console.log('🤖 Generating LLM-enhanced debt collection response...');
        
        // Create context-rich prompt for debt collection LLM
        const systemPrompt = `You are Priya, a professional debt collection assistant for a loan service company in India. You specialize in EMI reminders and debt recovery while maintaining empathy and compliance with debt collection regulations.

STRICT DOMAIN RESTRICTIONS:
- ONLY respond to queries related to: loans, EMI payments, debt collection, financial obligations, payment plans, legal consequences of default, and related financial/legal matters
- If the user asks about anything outside these topics, politely redirect them back to their loan obligations
- Do not provide advice on non-financial topics, general life advice, or unrelated services

Client Debt Information:
- Name: ${clientData.name}
- Mobile: ${clientData.mobile}
- Total Outstanding: ₹${clientData.totalDue}
- Monthly EMI: ₹${clientData.emiAmount}
- Due Date: ${new Date(clientData.dueDate).toLocaleDateString()}
- Current Sentiment: ${sentiment}

Lex Bot detected intent: ${lexIntent || 'Unknown'}
Lex Bot response: ${lexResponse || 'No response'}

Debt Collection Guidelines:
1. Always address the client by name professionally
2. Be firm but empathetic about payment obligations
3. Clearly state consequences of non-payment (late fees, credit score impact, legal action)
4. Offer payment solutions and restructuring options when appropriate
5. Use Indian legal and financial terminology correctly
6. Maintain compliance with RBI debt collection guidelines
7. Document payment commitments and follow-up requirements
8. Keep responses under 150 words for voice clarity
9. Always end with a clear call-to-action regarding payment

Legal Compliance:
- Follow RBI Fair Practices Code for debt collection
- Avoid harassment or threatening language
- Provide clear information about borrower rights
- Offer reasonable payment solutions`;

        const userPrompt = `Client said: "${userInput}"

Provide a professional debt collection response that improves upon the Lex bot response. Focus ONLY on loan/finance/legal matters. If the query is outside this domain, redirect to loan obligations. Make it natural for voice conversation while maintaining debt collection effectiveness.`;

        // Use AWS Bedrock for domain-restricted responses
        try {
            const bedrockParams = {
                modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0',
                contentType: 'application/json',
                accept: 'application/json',
                body: JSON.stringify({
                    anthropic_version: "bedrock-2023-05-31",
                    max_tokens: 300,
                    system: systemPrompt,
                    messages: [
                        {
                            role: "user",
                            content: userPrompt
                        }
                    ]
                })
            };

            const bedrockResult = await bedrock.invokeModel(bedrockParams).promise();
            const responseBody = JSON.parse(bedrockResult.body.toString());
            
            if (responseBody.content && responseBody.content[0] && responseBody.content[0].text) {
                console.log('✅ AWS Bedrock debt collection response generated');
                return responseBody.content[0].text.trim();
            }
        } catch (bedrockError) {
            console.log('⚠️ Bedrock not available:', bedrockError.message);
        }

        // If Bedrock fails, enhance the Lex response with debt collection context
        return enhanceDebtCollectionResponse(lexResponse || generateEnhancedAIResponse(userInput, clientData, sentiment), clientData, sentiment);

    } catch (error) {
        console.error('❌ LLM generation failed:', error);
        // Return enhanced debt collection response as final fallback
        return enhanceDebtCollectionResponse(lexResponse || generateEnhancedAIResponse(userInput, clientData, sentiment), clientData, sentiment);
    }
}

// Enhance debt collection responses with compliance and effectiveness
function enhanceDebtCollectionResponse(basicResponse, clientData, sentiment) {
    const isNegative = sentiment === 'NEGATIVE';
    const isPositive = sentiment === 'POSITIVE';
    
    let enhanced = basicResponse;
    
    // Add firm but empathetic opening for negative sentiment
    if (isNegative && !enhanced.includes('understand')) {
        enhanced = `I understand this situation may be difficult, ${clientData.name}, but it's important we address your loan obligations. ${enhanced}`;
    }
    
    // Add professional acknowledgment for positive sentiment
    if (isPositive && !enhanced.includes('appreciate')) {
        enhanced = `I appreciate your cooperation, ${clientData.name}. ${enhanced}`;
    }
    
    // Ensure it ends with a clear payment-focused call-to-action
    if (!enhanced.includes('payment') && !enhanced.includes('pay')) {
        enhanced += ` When can we expect your EMI payment of ₹${clientData.emiAmount}?`;
    }
    
    // Add legal compliance reminder if not present
    if (!enhanced.includes('legal') && !enhanced.includes('credit') && isNegative) {
        enhanced += ` Please note that continued non-payment may affect your credit score and could lead to legal action as per loan agreement terms.`;
    }
    
    return enhanced;
}

// Enhance basic responses with personalization
function enhanceBasicResponse(basicResponse, clientData, sentiment) {
    const isNegative = sentiment === 'NEGATIVE';
    const isPositive = sentiment === 'POSITIVE';
    
    let enhanced = basicResponse;
    
    // Add empathetic opening for negative sentiment
    if (isNegative && !enhanced.includes('understand')) {
        enhanced = `I understand this might be concerning, ${clientData.name}. ${enhanced}`;
    }
    
    // Add positive reinforcement for positive sentiment
    if (isPositive && !enhanced.includes('glad') && !enhanced.includes('wonderful')) {
        enhanced = `I'm glad to help you with this, ${clientData.name}. ${enhanced}`;
    }
    
    // Ensure it ends with a helpful question if it doesn't already
    if (!enhanced.includes('?') && !enhanced.includes('help')) {
        enhanced += ` Is there anything else I can help you with regarding your loan?`;
    }
    
    return enhanced;
}

// Save conversation transcript to S3 bucket
async function saveTranscriptToS3(conversationData, clientData, sessionId) {
    try {
        console.log('💾 Saving transcript to S3...');
        
        const timestamp = new Date().toISOString();
        const dateFolder = timestamp.split('T')[0]; // YYYY-MM-DD
        const fileName = `${dateFolder}/${clientData.name.replace(/\s+/g, '_')}_${clientData.mobile}_${sessionId}_${Date.now()}.json`;
        
        const transcriptData = {
            sessionId: sessionId,
            clientInfo: {
                name: clientData.name,
                mobile: clientData.mobile,
                totalDue: clientData.totalDue,
                emiAmount: clientData.emiAmount,
                dueDate: clientData.dueDate
            },
            conversation: conversationData,
            metadata: {
                timestamp: timestamp,
                region: process.env.AWS_REGION || 'ap-southeast-1',
                source: 'EMI-Reminder-AI',
                version: '1.0.0'
            }
        };
        
        const s3Params = {
            Bucket: process.env.S3_TRANSCRIPT_BUCKET || 'emi-audio-transcribe-001',
            Key: `transcripts/${fileName}`,
            Body: JSON.stringify(transcriptData, null, 2),
            ContentType: 'application/json',
            ServerSideEncryption: 'AES256',
            Metadata: {
                'client-name': clientData.name,
                'client-mobile': clientData.mobile,
                'session-id': sessionId,
                'conversation-date': dateFolder
            }
        };
        
        const result = await s3.upload(s3Params).promise();
        console.log('✅ Transcript saved to S3:', result.Location);
        
        return {
            success: true,
            location: result.Location,
            key: s3Params.Key
        };
        
    } catch (error) {
        console.error('❌ Failed to save transcript to S3:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Generate UUID without external dependency
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Complete EMI Reminder AI Lambda handler with diagnostic capabilities
exports.handler = async (event, context) => {
    console.log('🚀 EMI Reminder AI Lambda Handler Started');
    console.log('📥 Event received:', JSON.stringify(event, null, 2));
    console.log('📋 Context:', JSON.stringify(context, null, 2));
    
    // Standard response headers
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    };
    
    try {
        // Check if this is an API Gateway event or direct invocation
        const isApiGatewayEvent = event.httpMethod && event.path;
        const isEmptyEvent = Object.keys(event).length === 0;
        
        console.log('🔍 Event Analysis:');
        console.log('  - Is API Gateway Event:', isApiGatewayEvent);
        console.log('  - Is Empty Event:', isEmptyEvent);
        console.log('  - Event Keys:', Object.keys(event));
        
        if (!isApiGatewayEvent) {
            // API Gateway integration is broken
            console.log('❌ API Gateway Integration Issue - returning diagnostic info');
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: false,
                    message: 'API Gateway integration is broken',
                    issue: 'Lambda is not receiving proper API Gateway events',
                    solution: 'Configure your {api+} proxy resource with Lambda Proxy Integration',
                    debug: {
                        eventReceived: event,
                        eventType: isEmptyEvent ? 'empty' : 'unknown',
                        timestamp: new Date().toISOString(),
                        requestId: context.awsRequestId
                    }
                })
            };
        }
        
        // Process API Gateway event
        console.log('✅ API Gateway Event Detected');
        const httpMethod = event.httpMethod;
        let path = event.path;
        
        // Handle {api+} proxy resource
        if (event.pathParameters && event.pathParameters.api) {
            path = '/' + event.pathParameters.api;
            console.log('🎯 API+ Proxy detected, path:', path);
        }
        
        console.log('🔍 Processing:', httpMethod, path);
        
        // Handle OPTIONS requests (CORS preflight)
        if (httpMethod === 'OPTIONS') {
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ message: 'CORS preflight successful' })
            };
        }
        
        // Health check endpoints
        if ((path === '/api/health' || path === '/health') && httpMethod === 'GET') {
            console.log('🏥 Health check accessed');
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({ 
                    status: 'OK', 
                    message: 'EMI Reminder AI Backend is running',
                    path: path,
                    timestamp: new Date().toISOString(),
                    version: '1.0.0'
                })
            };
        }
        
        // Authentication endpoint
        if (path === '/api/auth/login' && httpMethod === 'POST') {
            console.log('🔐 Login endpoint accessed');
            const body = JSON.parse(event.body || '{}');
            const { username, password } = body;
            
            if (username === 'admin' && password === 'password') {
                return {
                    statusCode: 200,
                    headers: headers,
                    body: JSON.stringify({
                        success: true,
                        token: generateUUID(),
                        user: { username: 'admin', role: 'agent' }
                    })
                };
            } else {
                return {
                    statusCode: 401,
                    headers: headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'Invalid credentials'
                    })
                };
            }
        }
        
        // AWS Polly synthesis endpoints
        if ((path === '/api/polly/synthesize' || path === '/polly/synthesize') && httpMethod === 'POST') {
            console.log('🎵 Polly endpoint accessed');
            const body = JSON.parse(event.body || '{}');
            const { text, voiceId = 'Joanna', outputFormat = 'mp3' } = body;
            
            const params = {
                Text: text,
                OutputFormat: outputFormat,
                VoiceId: voiceId,
                Engine: 'neural',
                LanguageCode: 'en-IN'
            };
            
            const pollyResult = await polly.synthesizeSpeech(params).promise();
            const audioBase64 = pollyResult.AudioStream.toString('base64');
            
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    audioUrl: `data:audio/${outputFormat};base64,${audioBase64}`,
                    text: text,
                    voiceId: voiceId,
                    outputFormat: outputFormat
                })
            };
        }
        
        // Speech Recognition Debug endpoint
        if ((path === '/api/speech/debug' || path === '/speech/debug') && httpMethod === 'POST') {
            console.log('🎤 Speech debug endpoint accessed');
            const body = JSON.parse(event.body || '{}');
            const { transcript, confidence, isFinal } = body;
            
            console.log('🗣️ Speech Recognition Debug:', {
                transcript,
                confidence,
                isFinal,
                timestamp: new Date().toISOString()
            });
            
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    message: 'Speech debug data received',
                    received: {
                        transcript,
                        confidence,
                        isFinal,
                        timestamp: new Date().toISOString()
                    }
                })
            };
        }
        
        // Enhanced Chat endpoint with speech recognition support
        if ((path === '/api/chat/voice' || path === '/chat/voice') && httpMethod === 'POST') {
            console.log('🎤 Voice chat endpoint accessed');
            const body = JSON.parse(event.body || '{}');
            const { transcript, clientData, sessionId, confidence = 0.8 } = body;
            
            // Validate transcript
            if (!transcript || transcript.trim().length === 0) {
                return {
                    statusCode: 400,
                    headers: headers,
                    body: JSON.stringify({
                        success: false,
                        message: 'No transcript provided',
                        error: 'Empty or missing transcript'
                    })
                };
            }
            
            // Log voice interaction
            console.log('🗣️ Voice transcript received:', transcript);
            console.log('👤 Client:', clientData.name);
            console.log('🎯 Confidence:', confidence);
            
            // Use AWS Comprehend for sentiment analysis
            let sentimentResult = { Sentiment: 'NEUTRAL', SentimentScore: {} };
            try {
                const sentimentParams = {
                    Text: transcript,
                    LanguageCode: 'en'
                };
                sentimentResult = await comprehend.detectSentiment(sentimentParams).promise();
            } catch (error) {
                console.log('Comprehend not available, using neutral sentiment');
            }
            
            // Hybrid approach: Use both Lex and LLM for enhanced responses
            let lexResponse = null;
            let lexIntent = null;
            let response;
            
            // First, try to get Lex response for intent recognition
            try {
                const lexParams = {
                    botName: process.env.LEX_BOT_NAME || 'EMIReminderBot',
                    botAlias: process.env.LEX_BOT_ALIAS || 'PROD',
                    userId: sessionId || generateUUID(),
                    inputText: transcript,
                    sessionAttributes: {
                        clientName: clientData.name,
                        emiAmount: clientData.emiAmount.toString(),
                        totalDue: clientData.totalDue.toString(),
                        dueDate: clientData.dueDate,
                        mobile: clientData.mobile
                    }
                };
                const lexResult = await lexruntime.postText(lexParams).promise();
                lexResponse = lexResult.message;
                lexIntent = lexResult.intentName;
                console.log('✅ Lex response received:', { intent: lexIntent, response: lexResponse });
            } catch (lexError) {
                console.log('⚠️ Lex not available:', lexError.message);
            }
            
            // Now use LLM to enhance the response (or generate if Lex failed)
            try {
                response = await generateLLMResponse(
                    transcript, 
                    clientData, 
                    lexIntent, 
                    lexResponse, 
                    sentimentResult.Sentiment
                );
                console.log('✅ LLM-enhanced response generated');
            } catch (llmError) {
                console.log('⚠️ LLM enhancement failed, using Lex or fallback response');
                response = lexResponse || generateEnhancedAIResponse(transcript.toLowerCase(), clientData, sentimentResult.Sentiment);
            }
            
            // Store conversation
            const conversationEntry = {
                id: generateUUID(),
                sessionId: sessionId,
                clientId: clientData.id || generateUUID(),
                userMessage: transcript,
                aiResponse: response,
                sentiment: sentimentResult.Sentiment,
                confidence: confidence,
                timestamp: new Date().toISOString()
            };
            
            conversations.push(conversationEntry);
            
            // Save transcript to S3 bucket (async, don't wait for completion)
            saveTranscriptToS3(conversationEntry, clientData, sessionId)
                .then(result => {
                    if (result.success) {
                        console.log('✅ Transcript saved to S3:', result.location);
                    } else {
                        console.error('❌ Failed to save transcript:', result.error);
                    }
                })
                .catch(error => {
                    console.error('❌ S3 save error:', error);
                });
            
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    response: response,
                    transcript: transcript,
                    confidence: confidence,
                    sentiment: sentimentResult.Sentiment,
                    sentimentScore: sentimentResult.SentimentScore,
                    timestamp: new Date().toISOString()
                })
            };
        }
        
        // Client data endpoints
        if ((path === '/api/clients' || path === '/clients') && httpMethod === 'POST') {
            console.log('👥 Clients endpoint accessed');
            const body = JSON.parse(event.body || '{}');
            
            const clientData = {
                id: generateUUID(),
                name: body.name,
                mobile: body.mobile,
                totalDue: parseFloat(body.totalDue),
                emiAmount: parseFloat(body.emiAmount),
                dueDate: body.dueDate,
                createdAt: new Date().toISOString()
            };
            
            clients.push(clientData);
            
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    client: clientData,
                    message: 'Client data stored successfully'
                })
            };
        }
        
        // Get all clients
        if ((path === '/api/clients' || path === '/clients') && httpMethod === 'GET') {
            console.log('👥 Get clients endpoint accessed');
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    clients: clients,
                    count: clients.length
                })
            };
        }
        
        // Chat endpoints
        if ((path === '/api/chat' || path === '/chat') && httpMethod === 'POST') {
            console.log('💬 Chat endpoint accessed');
            const body = JSON.parse(event.body || '{}');
            const { message, clientData, sessionId } = body;
            
            // Use AWS Comprehend for sentiment analysis
            let sentimentResult = { Sentiment: 'NEUTRAL', SentimentScore: {} };
            try {
                const sentimentParams = {
                    Text: message,
                    LanguageCode: 'en'
                };
                sentimentResult = await comprehend.detectSentiment(sentimentParams).promise();
            } catch (error) {
                console.log('Comprehend not available, using neutral sentiment');
            }
            
            // Use AWS Lex for natural language understanding
            let response;
            try {
                const lexParams = {
                    botName: process.env.LEX_BOT_NAME || 'EMIReminderBot',
                    botAlias: process.env.LEX_BOT_ALIAS || 'PROD',
                    userId: sessionId || generateUUID(),
                    inputText: message,
                    sessionAttributes: {
                        clientName: clientData.name,
                        emiAmount: clientData.emiAmount.toString(),
                        totalDue: clientData.totalDue.toString(),
                        dueDate: clientData.dueDate,
                        mobile: clientData.mobile
                    }
                };
                const lexResult = await lexruntime.postText(lexParams).promise();
                response = lexResult.message;
            } catch (lexError) {
                console.log('Lex not available, using fallback AI response');
                response = generateEnhancedAIResponse(message.toLowerCase(), clientData, sentimentResult.Sentiment);
            }
            
            return {
                statusCode: 200,
                headers: headers,
                body: JSON.stringify({
                    success: true,
                    response: response,
                    timestamp: new Date().toISOString(),
                    confidence: 0.95,
                    sentiment: sentimentResult.Sentiment,
                    sentimentScore: sentimentResult.SentimentScore
                })
            };
        }
        
        // Default 404 response
        console.log('❌ Endpoint not found:', httpMethod, path);
        return {
            statusCode: 404,
            headers: headers,
            body: JSON.stringify({
                success: false,
                message: 'API endpoint not found',
                path: path,
                method: httpMethod,
                availableEndpoints: [
                    'GET /api/health',
                    'POST /api/auth/login',
                    'POST /api/polly/synthesize',
                    'POST /api/clients',
                    'GET /api/clients',
                    'POST /api/chat'
                ]
            })
        };
        
    } catch (error) {
        console.error('❌ Lambda Handler Error:', error);
        console.error('❌ Error stack:', error.stack);
        
        return {
            statusCode: 500,
            headers: headers,
            body: JSON.stringify({
                success: false,
                message: 'Internal server error',
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
                debug: {
                    eventReceived: event,
                    timestamp: new Date().toISOString(),
                    requestId: context.awsRequestId
                }
            })
        };
    }
};
