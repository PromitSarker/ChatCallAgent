// audioQueue.js

export class AudioQueue {
    constructor(sampleRate = 24000) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
        this.queue = [];
        this.isPlaying = false;
        this.scheduledSources = [];
        this.nextStartTime = 0;
    }

    async init() {
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async addAudioFromBase64(base64String) {
        try {
            const binaryString = window.atob(base64String);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Gemini audio is 16kHz PCM (or 24kHz). We need to wrap it in a WAV header or convert it to AudioBuffer.
            // Since it's raw 16-bit PCM, we can manually convert the Int16Array to an AudioBuffer.
            
            const pcm16 = new Int16Array(bytes.buffer);
            const audioBuffer = this.audioContext.createBuffer(1, pcm16.length, 24000); // Gemini Multimodal Live uses 24kHz output
            const channelData = audioBuffer.getChannelData(0);
            
            for (let i = 0; i < pcm16.length; i++) {
                channelData[i] = pcm16[i] / 32768.0;
            }

            this.queue.push(audioBuffer);
            this.playNext();
        } catch (e) {
            console.error("Error decoding audio:", e);
        }
    }

    playNext() {
        if (this.queue.length === 0) {
            this.isPlaying = false;
            return;
        }

        if (!this.isPlaying) {
            this.isPlaying = true;
            // Add a 150ms jitter buffer when starting playback.
            // This prevents the first tiny audio chunk from finishing 
            // before the next chunk arrives over the network (causing a stutter).
            this.nextStartTime = this.audioContext.currentTime + 0.15; 
        }

        // We want to schedule all queued buffers
        while (this.queue.length > 0) {
            const buffer = this.queue.shift();
            
            // If we are falling behind (queue starved), reset the start time 
            // with a small buffer to prevent immediate repeated stuttering.
            if (this.nextStartTime < this.audioContext.currentTime) {
                this.nextStartTime = this.audioContext.currentTime + 0.05;
            }

            const source = this.audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext.destination);
            source.start(this.nextStartTime);
            
            this.scheduledSources.push(source);
            this.nextStartTime += buffer.duration;
            
            source.onended = () => {
                const index = this.scheduledSources.indexOf(source);
                if (index > -1) {
                    this.scheduledSources.splice(index, 1);
                }
                if (this.scheduledSources.length === 0) {
                    this.isPlaying = false;
                }
            };
        }
    }

    stop() {
        this.scheduledSources.forEach(source => {
            try {
                source.stop();
            } catch (e) {}
        });
        this.scheduledSources = [];
        this.queue = [];
        this.isPlaying = false;
        this.nextStartTime = 0;
    }
}
