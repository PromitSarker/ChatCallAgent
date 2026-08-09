import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const generateCaptchaText = (length = 5) => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return result;
};

export const CaptchaGate = ({ onSolved }) => {
  const [captchaText, setCaptchaText] = useState('');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const canvasRef = useRef(null);

  const drawCaptcha = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background
    ctx.fillStyle = '#f3f4f6'; // Light gray
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Generate text
    const text = generateCaptchaText();
    setCaptchaText(text);
    
    // Draw text with random rotation/scale
    ctx.font = 'bold 30px Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    for (let i = 0; i < text.length; i++) {
      ctx.save();
      const x = 30 + (i * 28);
      const y = canvas.height / 2;
      ctx.translate(x, y);
      const rotation = (Math.random() - 0.5) * 0.4;
      ctx.rotate(rotation);
      ctx.fillStyle = '#1e293b';
      ctx.fillText(text[i], 0, 0);
      ctx.restore();
    }
    
    // Draw noise lines
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(0,0,0, ${Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.lineWidth = Math.random() * 2 + 1;
      ctx.stroke();
    }
    
    // Draw noise dots
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(0,0,0, ${Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 2, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  useEffect(() => {
    drawCaptcha();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (input === captchaText) {
      onSolved();
    } else {
      setError('Incorrect CAPTCHA. Please try again.');
      setInput('');
      drawCaptcha();
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#f8fafc'
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', textAlign: 'center', maxWidth: '400px', width: '100%', boxSizing: 'border-box'
        }}
      >
        <img src="/logo.png" alt="Logo" style={{ height: '40px', marginBottom: '20px' }} />
        <h2 style={{ margin: '0 0 10px 0', fontSize: '1.5rem', color: '#0f172a' }}>Security Check</h2>
        <p style={{ margin: '0 0 20px 0', color: '#64748b' }}>Please solve this CAPTCHA to verify you are human.</p>
        
        <canvas 
          ref={canvasRef} 
          width={180} 
          height={70} 
          style={{ border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', marginBottom: '20px' }}
          onClick={drawCaptcha}
          title="Click to get a new CAPTCHA"
        />
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input 
            type="text" 
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            placeholder="Enter the text above"
            style={{
              padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '1rem', width: '100%', boxSizing: 'border-box'
            }}
            autoFocus
          />
          {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', margin: 0, textAlign: 'left' }}>{error}</p>}
          
          <button 
            type="submit"
            style={{
              padding: '12px', borderRadius: '8px', border: 'none', background: '#0f172a', color: 'white', fontSize: '1rem', cursor: 'pointer', fontWeight: '500', marginTop: '10px'
            }}
          >
            Verify
          </button>
        </form>
      </motion.div>
    </div>
  );
};
