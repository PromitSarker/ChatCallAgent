// audioQueue.js

export class AudioQueue {
    constructor(context, onPlaybackChange = null) {
        this.audioContext = context;
        this.queue = [];
        this.isPlaying = false;
        this.scheduledSources = [];
        this.nextStartTime = 0;
        this.onPlaybackChange = onPlaybackChange;
        this.leftoverByte = null;
    }

    setPlaying(playing) {
        if (this.isPlaying !== playing) {
            this.isPlaying = playing;
            if (this.onPlaybackChange) {
                this.onPlaybackChange(playing);
            }
        }
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
            
            let totalBytes = len + (this.leftoverByte !== null ? 1 : 0);
            const bytes = new Uint8Array(totalBytes);
            
            let offset = 0;
            if (this.leftoverByte !== null) {
                bytes[0] = this.leftoverByte;
                offset = 1;
                this.leftoverByte = null;
            }
            
            for (let i = 0; i < len; i++) {
                bytes[offset + i] = binaryString.charCodeAt(i);
            }

            // Gemini audio is 16kHz PCM (or 24kHz). We need to wrap it in a WAV header or convert it to AudioBuffer.
            // Since it's raw 16-bit PCM, we can manually convert the Int16Array to an AudioBuffer.
            
            let usableBytes = bytes;
            if (totalBytes % 2 !== 0) {
                this.leftoverByte = bytes[totalBytes - 1];
                usableBytes = new Uint8Array(bytes.buffer, 0, totalBytes - 1);
            }
            
            if (usableBytes.length === 0) return;
            
            const pcm16 = new Int16Array(usableBytes.buffer, usableBytes.byteOffset, usableBytes.byteLength / 2);
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
            if (this.scheduledSources.length === 0) this.setPlaying(false);
            return;
        }

        if (!this.isPlaying) {
            // Check if we have enough audio buffered to start safely without stuttering
            const bufferedDuration = this.queue.reduce((acc, buffer) => acc + buffer.duration, 0);
            
            // Jitter buffer threshold: strictly 500ms
            if (bufferedDuration < 0.5) {
                // Not enough buffer yet. We wait indefinitely for the next chunk,
                // or until flush() is called when the turn completes.
                return;
            }
            
            // We reached the threshold! Start playing.
            this.startPlayback();
            return;
        }

        this.scheduleQueuedBuffers();
    }

    flush() {
        // Force start playback immediately if we have audio waiting (e.g. at the end of a short turn)
        if (!this.isPlaying && this.queue.length > 0) {
            this.startPlayback();
        }
    }

    startPlayback() {
        this.setPlaying(true);
        this.nextStartTime = this.audioContext.currentTime + 0.1; // 100ms safety margin for hardware wakeup
        this.scheduleQueuedBuffers();
    }

    scheduleQueuedBuffers() {
        while (this.queue.length > 0) {
            const buffer = this.queue.shift();
            
            // If we are falling behind (queue starved), reset the start time 
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
                if (this.scheduledSources.length === 0 && this.queue.length === 0) {
                    this.setPlaying(false);
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
        this.setPlaying(false);
        this.nextStartTime = 0;
        this.leftoverByte = null;
    }
}
