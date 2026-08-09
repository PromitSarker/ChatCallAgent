import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquarePlus, MessageSquare, Paperclip, Loader2, Phone, PhoneOff, Mic, MicOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import { AudioQueue } from './utils/audioQueue';
import { CaptchaGate } from './components/CaptchaGate';


const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

function App() {
  const [conversationId, setConversationId] = useState('');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // CAPTCHA state
  const [isVerified, setIsVerified] = useState(() => {
    return localStorage.getItem('captchaSolved') === 'true';
  });

  // Voice call states
  const [isCallActive, setIsCallActive] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // Live voice refs
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const audioQueueRef = useRef(null);

  useEffect(() => {
    setConversationId(generateUUID());
    return () => {
      endCall();
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleNewChat = () => {
    if (isCallActive) endCall();
    setConversationId(generateUUID());
    setMessages([]);
    setInput('');
  };

  // ----------------------------------------------------
  // Text Chat Logic
  // ----------------------------------------------------
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`/api/chat/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.assistant_response }]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();
      
      const fileMessage = `Here is my document: ${data.url}`;
      setMessages((prev) => [...prev, { role: 'user', content: fileMessage }]);
      setIsLoading(true);

      const chatResponse = await fetch(`/api/chat/${conversationId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fileMessage }),
      });
      if (!chatResponse.ok) throw new Error('Chat failed');
      const chatData = await chatResponse.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: chatData.assistant_response }]);
    } catch (error) {
      console.error('Error uploading file:', error);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Upload error: ${error.message}` }]);
    } finally {
      setIsUploading(false);
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ----------------------------------------------------
  // Voice Live Call Logic
  // ----------------------------------------------------
  const toggleCall = () => {
    if (isCallActive) {
      endCall();
    } else {
      startCall();
    }
  };

  const startCall = async () => {
    try {
      // 1. Get Microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;

      // 2. Initialize Audio Queue (for playback)
      const audioQueue = new AudioQueue(24000);
      await audioQueue.init();
      audioQueueRef.current = audioQueue;

      // 3. Connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/voice/ws/${conversationId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsCallActive(true);
        console.log("Voice WS connected");
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.interrupted) {
          audioQueue.stop(); // Stop current playback on barge-in
        }
        if (data.audioB64) {
          audioQueue.addAudioFromBase64(data.audioB64);
        }
        if (data.chat_message) {
          setMessages(prev => [...prev, { role: 'assistant', content: data.chat_message }]);
        }
        if (data.text) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            // If the last message is assistant, append to it (streaming text)
            // Or just add new message
            if (last && last.role === 'assistant') {
              const updated = [...prev];
              updated[updated.length - 1] = { ...last, content: last.content + ' ' + data.text };
              return updated;
            } else {
              return [...prev, { role: 'assistant', content: data.text }];
            }
          });
        }
      };

      ws.onclose = () => {
        console.log("Voice WS closed");
        endCall();
      };

      // 4. Record and send audio
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      
      // ScriptProcessor is deprecated but works everywhere. AudioWorklet is better for production.
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        // Convert Float32 to Int16 PCM
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Convert Int16Array to base64
        const buffer = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < buffer.byteLength; i++) {
          binary += String.fromCharCode(buffer[i]);
        }
        const base64Str = window.btoa(binary);

        wsRef.current.send(JSON.stringify({ audioB64: base64Str }));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

    } catch (err) {
      console.error("Failed to start call", err);
      alert("Microphone access denied or error starting call.");
      endCall();
    }
  };

  const endCall = () => {
    setIsCallActive(false);
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioQueueRef.current) {
      audioQueueRef.current.stop();
      audioQueueRef.current = null;
    }
  };

  const actionButtons = (
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
      <motion.button 
        className={`new-chat-btn ${isCallActive ? 'active-voice-btn' : ''}`} 
        onClick={toggleCall} 
        style={{ backgroundColor: isCallActive ? '#ef4444' : '' }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        {isCallActive ? <PhoneOff size={18} /> : <Phone size={18} />}
        {isCallActive ? 'End Live Call' : 'Call AI'}
      </motion.button>
      <motion.button 
        className="new-chat-btn" 
        onClick={handleNewChat}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <MessageSquarePlus size={18} />
        New Chat
      </motion.button>
    </div>
  );

  if (!isVerified) {
    return <CaptchaGate onSolved={() => {
      setIsVerified(true);
      localStorage.setItem('captchaSolved', 'true');
    }} />;
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-brand">
          <img src="/logo.png" alt="RT Communications Logo" className="brand-logo" />
        </div>
        {(messages.length > 0 || isCallActive) && actionButtons}
      </header>

      <main className="chat-container">
        {messages.length === 0 ? (
          <motion.div 
            className="empty-state"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <img src="/logo.png" alt="RT Communications Logo" className="empty-state-logo" />
            <h2>How can I help you today?</h2>
            <p>Ask about masking SMS, pricing, or our API features.</p>
            <div style={{ marginTop: '24px' }}>
              {actionButtons}
            </div>
          </motion.div>
        ) : (
          messages.map((msg, index) => (
            <motion.div 
              key={index} 
              className={`message-wrapper ${msg.role}`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className={`avatar ${msg.role}`}>
                {msg.role === 'user' ? 'U' : 'RT'}
              </div>
              <div className="message-bubble">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </motion.div>
          ))
        )}
        
        {isLoading && (
          <motion.div 
            className="message-wrapper assistant"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="avatar assistant">RT</div>
            <div className="message-bubble typing-indicator">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </main>

      <div className="input-container">
        {isCallActive ? (
          <div className="voice-controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
            <motion.div 
              className="mic-button recording"
              style={{
                width: '80px', height: '80px', borderRadius: '50%',
                backgroundColor: '#ef4444',
                color: 'white', display: 'flex', justifyContent: 'center', alignItems: 'center',
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.6)',
              }}
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            >
              <Mic size={32} />
            </motion.div>
            <p style={{ marginTop: '16px', color: '#94a3b8', fontSize: '0.9rem' }}>
              Live call active. Speak naturally.
            </p>
          </div>
        ) : (
          <form className="input-form" onSubmit={handleSend}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileUpload}
              accept="image/*,.pdf,.doc,.docx"
            />
            <motion.button
              type="button"
              className="attachment-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              title="Upload Document"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isUploading ? <Loader2 size={20} className="spin" /> : <Paperclip size={20} />}
            </motion.button>
            
            <input
              type="text"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message here..."
              disabled={isLoading || isUploading}
            />
            <motion.button 
              type="submit" 
              className="send-btn" 
              disabled={!input.trim() || isLoading || isUploading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Send size={18} />
            </motion.button>
          </form>
        )}
      </div>
    </div>
  );
}

export default App;
